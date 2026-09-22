import type { Server as HttpServer } from "node:http";
import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const PROTOCOL_VERSION = "0.6.3";
const MAX_PLAYERS_PER_HOST = 16;
const INVITE_TTL_MS = 2 * 60 * 60 * 1000;
const ICE_CACHE_TTL_MS = 60 * 1000;
const ICE_FALLBACK_CACHE_TTL_MS = 15 * 1000;
const POLYTRACK_ICE_URL = `https://vps.kodub.com/v6/iceServers?version=${PROTOCOL_VERSION}`;

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const FALLBACK_ICE_SERVERS: IceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
let iceServerCache: { servers: IceServer[]; expiresAt: number } | null = null;

type JsonMessage = Record<string, unknown>;

type HostRoom = {
  inviteCode: string;
  host: WebSocket;
  hostKey: string;
  nickname: string | null;
  createdAt: number;
  joins: Map<string, WebSocket>;
};

type JoinConnection = {
  session: string;
  inviteCode: string;
  host: WebSocket;
  join: WebSocket;
};

const rooms = new Map<string, HostRoom>();
const joins = new Map<string, JoinConnection>();

function cloneIceServers(servers: IceServer[]) {
  return servers.map(server => ({
    urls: Array.isArray(server.urls) ? [...server.urls] : server.urls,
    ...(server.username ? { username: server.username } : {}),
    ...(server.credential ? { credential: server.credential } : {}),
  }));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string" && item.length > 0);
}

export function normalizeIceServers(value: unknown): IceServer[] {
  if (!Array.isArray(value)) return cloneIceServers(FALLBACK_ICE_SERVERS);

  const servers = value.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    const urls = typeof candidate.urls === "string"
      ? candidate.urls.length > 0 ? candidate.urls : null
      : isStringArray(candidate.urls) && candidate.urls.length > 0 ? candidate.urls : null;
    if (!urls) return [];

    const server: IceServer = { urls };
    if (typeof candidate.username === "string" && candidate.username.length > 0) {
      server.username = candidate.username;
    }
    if (typeof candidate.credential === "string" && candidate.credential.length > 0) {
      server.credential = candidate.credential;
    }
    return [server];
  });

  return servers.length > 0 ? servers : cloneIceServers(FALLBACK_ICE_SERVERS);
}

export async function getIceServers(now = Date.now()): Promise<IceServer[]> {
  if (iceServerCache && iceServerCache.expiresAt > now) {
    return cloneIceServers(iceServerCache.servers);
  }

  try {
    const response = await fetch(POLYTRACK_ICE_URL, {
      headers: {
        accept: "application/json",
        origin: "https://www.kodub.com",
        referer: "https://www.kodub.com/",
        "user-agent": "Agenda relay/1.0",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`PolyTrack ICE request failed with ${response.status}`);
    }

    const servers = normalizeIceServers(await response.json());
    iceServerCache = { servers, expiresAt: now + ICE_CACHE_TTL_MS };
    return cloneIceServers(servers);
  } catch (error) {
    console.warn("[PolyTrack multiplayer] ICE server request failed; using STUN fallback", error);
    const fallback = cloneIceServers(FALLBACK_ICE_SERVERS);
    iceServerCache = { servers: fallback, expiresAt: now + ICE_FALLBACK_CACHE_TTL_MS };
    return cloneIceServers(fallback);
  }
}

export function resetIceServerCacheForTests() {
  iceServerCache = null;
}

function sendJson(socket: WebSocket, message: JsonMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function makeCode(length = 8) {
  return randomBytes(length).toString("base64url").slice(0, length).toUpperCase();
}

function makeUniqueCode() {
  let code = makeCode();
  while (rooms.has(code)) code = makeCode();
  return code;
}

function makeSessionId() {
  let session = makeCode(16);
  while (joins.has(session)) session = makeCode(16);
  return session;
}

function isJsonMessage(value: unknown): value is JsonMessage {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function protocolMessage(type: string, extra: JsonMessage = {}): JsonMessage {
  return { version: PROTOCOL_VERSION, type, ...extra };
}

function cleanupJoin(session: string) {
  const connection = joins.get(session);
  if (!connection) return;
  joins.delete(session);
  const room = Array.from(rooms.values()).find(candidate => candidate.joins.has(session));
  room?.joins.delete(session);
  if (connection.join.readyState === WebSocket.OPEN) connection.join.close();
}

function cleanupRoom(room: HostRoom) {
  rooms.delete(room.inviteCode);
  for (const session of Array.from(room.joins.keys())) {
    const connection = joins.get(session);
    if (connection) {
      joins.delete(session);
      if (connection.join.readyState === WebSocket.OPEN) connection.join.close();
    }
  }
  room.joins.clear();
}

function expireRooms() {
  const now = Date.now();
  for (const room of Array.from(rooms.values())) {
    if (now - room.createdAt > INVITE_TTL_MS || room.host.readyState !== WebSocket.OPEN) {
      cleanupRoom(room);
    }
  }
}

function handleHost(socket: WebSocket) {
  let room: HostRoom | null = null;

  socket.on("message", raw => {
    let message: unknown;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      socket.close(1008, "Malformed JSON");
      return;
    }
    if (!isJsonMessage(message) || typeof message.type !== "string") {
      socket.close(1008, "Malformed protocol message");
      return;
    }

    if (message.type === "createInvite") {
      const hostKey = typeof message.key === "string" && message.key.length > 0 ? message.key : makeCode(16);
      if (room) rooms.delete(room.inviteCode);
      room = {
        inviteCode: makeUniqueCode(),
        host: socket,
        hostKey,
        nickname: typeof message.nickname === "string" ? message.nickname : null,
        createdAt: Date.now(),
        joins: new Map(),
      };
      rooms.set(room.inviteCode, room);
      sendJson(socket, protocolMessage("createInvite", {
        inviteCode: room.inviteCode,
        key: room.hostKey,
        timeoutMilliseconds: INVITE_TTL_MS,
        censoredNickname: room.nickname,
      }));
      return;
    }

    if (message.type === "ping") {
      sendJson(socket, protocolMessage("pong"));
      return;
    }

    if (!room) {
      sendJson(socket, protocolMessage("error", { error: "ExpiredInvite" }));
      return;
    }

    if (message.type === "iceCandidate" && typeof message.session === "string") {
      const connection = joins.get(message.session);
      if (connection?.host === socket) {
        sendJson(connection.join, protocolMessage("iceCandidate", { candidate: message.candidate ?? null }));
      }
      return;
    }

    if (message.type === "acceptJoin" && typeof message.session === "string") {
      const connection = joins.get(message.session);
      if (connection?.host !== socket) return;
      sendJson(connection.join, { ...message, version: PROTOCOL_VERSION, type: "acceptJoin" });
      return;
    }

    if (message.type === "declineJoin" && typeof message.session === "string") {
      const connection = joins.get(message.session);
      if (connection?.host !== socket) return;
      sendJson(connection.join, protocolMessage("declineJoin", {
        session: message.session,
        reason: typeof message.reason === "string" ? message.reason : "WebRTCError",
      }));
      cleanupJoin(message.session);
      return;
    }

    if (message.type === "joinDisconnect" && typeof message.session === "string") {
      const connection = joins.get(message.session);
      if (connection?.host === socket) cleanupJoin(message.session);
    }
  });

  socket.on("close", () => {
    if (room) cleanupRoom(room);
  });
}

function handleJoin(socket: WebSocket) {
  let session: string | null = null;

  socket.on("message", async raw => {
    let message: unknown;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      socket.close(1008, "Malformed JSON");
      return;
    }
    if (!isJsonMessage(message) || typeof message.type !== "undefined") {
      if (!isJsonMessage(message)) {
        socket.close(1008, "Malformed protocol message");
        return;
      }
    }

    if (!session) {
      const inviteCode = typeof message.inviteCode === "string" ? message.inviteCode.toUpperCase() : "";
      const room = rooms.get(inviteCode);
      if (!room || room.host.readyState !== WebSocket.OPEN || room.joins.size >= MAX_PLAYERS_PER_HOST) {
        sendJson(socket, protocolMessage("error", { error: "ExpiredInvite" }));
        socket.close();
        return;
      }
      if (typeof message.offer !== "string" || typeof message.nickname !== "string" || typeof message.carStyle !== "string") {
        sendJson(socket, protocolMessage("declineJoin", { reason: "MalformedClientData" }));
        socket.close();
        return;
      }

      session = makeSessionId();
      const connection: JoinConnection = { session, inviteCode, host: room.host, join: socket };
      joins.set(session, connection);
      room.joins.set(session, socket);

      const currentIceServers = await getIceServers();
      sendJson(room.host, protocolMessage("joinInvite", {
        session,
        offer: message.offer,
        mods: Array.isArray(message.mods) ? message.mods : [],
        isModsVanillaCompatible: message.isModsVanillaCompatible !== false,
        nickname: message.nickname,
        countryCode: message.countryCode ?? null,
        carStyle: message.carStyle,
        iceServers: currentIceServers,
        version: PROTOCOL_VERSION,
      }));
      return;
    }

    const connection = joins.get(session);
    if (!connection || connection.join !== socket) return;

    if (message.type === "candidate") {
      sendJson(connection.host, protocolMessage("iceCandidate", {
        session,
        candidate: message.candidate ?? null,
      }));
      return;
    }
  });

  socket.on("close", () => {
    if (!session) return;
    const connection = joins.get(session);
    if (connection) {
      sendJson(connection.host, protocolMessage("joinDisconnect", { session }));
      cleanupJoin(session);
    }
  });
}

export function registerPolyTrackMultiplayer(server: HttpServer, app: { get: Function }) {
  app.get("/v6/iceServers", (_req: unknown, res: { json: (value: unknown) => void }) => {
    getIceServers().then(res.json.bind(res)).catch(() => res.json(cloneIceServers(FALLBACK_ICE_SERVERS)));
  });

  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/v6/multiplayer/host" && pathname !== "/v6/multiplayer/join") return;
    websocketServer.handleUpgrade(request, socket, head, client => {
      if (pathname.endsWith("/host")) handleHost(client);
      else handleJoin(client);
    });
  });

  const cleanupTimer = setInterval(expireRooms, 60_000);
  cleanupTimer.unref();
  console.log("PolyTrack multiplayer signaling enabled on /v6/multiplayer/{host,join}");
}
