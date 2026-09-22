import type { Server as HttpServer } from "node:http";
import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  createMultiplayerRoom,
  deleteMultiplayerRoom,
  enqueueMultiplayerSignal,
  getMultiplayerRoom,
  pruneMultiplayerState,
  takeMultiplayerSignals,
} from "./db";

const PROTOCOL_VERSION = "0.6.3";
const MAX_PLAYERS_PER_HOST = 16;
const INVITE_TTL_MS = 2 * 60 * 60 * 1000;
const ICE_CACHE_TTL_MS = 60 * 1000;
const ICE_FALLBACK_CACHE_TTL_MS = 15 * 1000;
const SIGNAL_POLL_INTERVAL_MS = 250;
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
  persistent: boolean;
  joins: Map<string, WebSocket | null>;
};

type JoinConnection = {
  session: string;
  inviteCode: string;
  host: WebSocket | null;
  join: WebSocket | null;
  persistent: boolean;
};

const rooms = new Map<string, HostRoom>();
const joins = new Map<string, JoinConnection>();
const persistentJoinConnections = new Map<string, JoinConnection>();
let signalPollInFlight = false;

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

function expandTurnUrls(urls: string | string[]) {
  const source = Array.isArray(urls) ? urls : [urls];
  const expanded: string[] = [];
  for (const url of source) {
    if (!url.startsWith("turn:") && !url.startsWith("turns:")) {
      expanded.push(url);
      continue;
    }
    expanded.push(url);
    if (url.includes("?transport=")) continue;
    if (url.startsWith("turn:")) {
      expanded.push(`${url}?transport=udp`, `${url}?transport=tcp`);
    } else {
      expanded.push(`${url}?transport=tcp`);
    }
  }
  return Array.from(new Set(expanded));
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

    const expandedUrls = expandTurnUrls(urls);
    const server: IceServer = {
      urls: expandedUrls.length === 1 ? expandedUrls[0] : expandedUrls,
    };
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

function sendJson(socket: WebSocket | null, message: JsonMessage) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

async function enqueueSignal(connection: JoinConnection, recipient: "host" | "join", message: JsonMessage) {
  if (recipient === "host" && connection.host?.readyState === WebSocket.OPEN) {
    sendJson(connection.host, message);
    return true;
  }
  if (recipient === "join" && connection.join?.readyState === WebSocket.OPEN && !connection.persistent) {
    sendJson(connection.join, message);
    return true;
  }
  return enqueueMultiplayerSignal({
    inviteCode: connection.inviteCode,
    session: connection.session,
    recipient,
    payload: JSON.stringify(message),
  });
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

function parseMessage(raw: WebSocket.RawData) {
  try {
    const message: unknown = JSON.parse(raw.toString());
    return isJsonMessage(message) ? message : null;
  } catch {
    return null;
  }
}

function protocolMessage(type: string, extra: JsonMessage = {}): JsonMessage {
  return { version: PROTOCOL_VERSION, type, ...extra };
}

function cleanupJoin(session: string) {
  const connection = joins.get(session);
  if (!connection) return;
  joins.delete(session);
  persistentJoinConnections.delete(session);
  const room = rooms.get(connection.inviteCode);
  room?.joins.delete(session);
  if (connection.join?.readyState === WebSocket.OPEN) connection.join.close();
}

function cleanupRoom(room: HostRoom) {
  rooms.delete(room.inviteCode);
  if (room.persistent) void deleteMultiplayerRoom(room.inviteCode).catch(error => {
    console.warn("[PolyTrack multiplayer] Failed to delete room", error);
  });
  for (const session of Array.from(room.joins.keys())) {
    const connection = joins.get(session);
    if (connection) {
      joins.delete(session);
      persistentJoinConnections.delete(session);
      if (connection.join?.readyState === WebSocket.OPEN) connection.join.close();
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

async function sendJoinInvite(room: HostRoom, session: string, message: JsonMessage) {
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
}

async function processHostSignal(room: HostRoom, session: string, message: JsonMessage) {
  if (message.type === "joinRequest") {
    if (room.joins.has(session) || room.joins.size >= MAX_PLAYERS_PER_HOST) return;
    if (typeof message.offer !== "string" || typeof message.nickname !== "string" || typeof message.carStyle !== "string") {
      return;
    }
    const connection: JoinConnection = {
      session,
      inviteCode: room.inviteCode,
      host: room.host,
      join: null,
      persistent: true,
    };
    room.joins.set(session, null);
    joins.set(session, connection);
    await sendJoinInvite(room, session, message);
    return;
  }

  const connection = joins.get(session);
  if (!connection || connection.host !== room.host) return;

  if (message.type === "candidate") {
    sendJson(room.host, protocolMessage("iceCandidate", {
      session,
      candidate: message.candidate ?? null,
    }));
    return;
  }
  if (message.type === "joinDisconnect") {
    sendJson(room.host, protocolMessage("joinDisconnect", { session }));
    room.joins.delete(session);
    joins.delete(session);
  }
}

async function processPersistentSignals() {
  if (signalPollInFlight) return;
  signalPollInFlight = true;
  try {
    for (const room of Array.from(rooms.values())) {
      if (!room.persistent) continue;
      const signals = await takeMultiplayerSignals({
        inviteCode: room.inviteCode,
        recipient: "host",
      });
      for (const signal of signals) {
        try {
          const message = JSON.parse(signal.payload) as JsonMessage;
          await processHostSignal(room, signal.session, message);
        } catch (error) {
          console.warn("[PolyTrack multiplayer] Invalid host signal", error);
        }
      }
    }

    for (const connection of Array.from(persistentJoinConnections.values())) {
      const signals = await takeMultiplayerSignals({
        inviteCode: connection.inviteCode,
        session: connection.session,
        recipient: "join",
      });
      for (const signal of signals) {
        try {
          const message = JSON.parse(signal.payload) as JsonMessage;
          sendJson(connection.join, message);
          if (message.type === "declineJoin" || message.type === "joinDisconnect") {
            cleanupJoin(connection.session);
          }
        } catch (error) {
          console.warn("[PolyTrack multiplayer] Invalid join signal", error);
        }
      }
    }
  } catch (error) {
    console.warn("[PolyTrack multiplayer] Signal polling failed", error);
  } finally {
    signalPollInFlight = false;
  }
}

function handleHost(socket: WebSocket) {
  let room: HostRoom | null = null;

  socket.on("message", raw => {
    void (async () => {
      const message = parseMessage(raw);
      if (!message || typeof message.type !== "string") {
        socket.close(1008, "Malformed protocol message");
        return;
      }

      if (message.type === "createInvite") {
        if (room) cleanupRoom(room);
        const hostKey = typeof message.key === "string" && message.key.length > 0 ? message.key : makeCode(16);
        const inviteCode = makeUniqueCode();
        room = {
          inviteCode,
          host: socket,
          hostKey,
          nickname: typeof message.nickname === "string" ? message.nickname : null,
          createdAt: Date.now(),
          persistent: false,
          joins: new Map(),
        };
        try {
          room.persistent = await createMultiplayerRoom({
            inviteCode,
            hostKey,
            nickname: room.nickname,
            createdAt: new Date(room.createdAt),
            expiresAt: new Date(room.createdAt + INVITE_TTL_MS),
          });
        } catch (error) {
          console.warn("[PolyTrack multiplayer] Persistent room unavailable; using local room", error);
        }
        rooms.set(inviteCode, room);
        sendJson(socket, protocolMessage("createInvite", {
          inviteCode,
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
          await enqueueSignal(connection, "join", protocolMessage("iceCandidate", {
            candidate: message.candidate ?? null,
          }));
        }
        return;
      }

      if (message.type === "acceptJoin" && typeof message.session === "string") {
        const connection = joins.get(message.session);
        if (connection?.host !== socket) return;
        const payload = { ...message, version: PROTOCOL_VERSION, type: "acceptJoin" };
        if (connection.join?.readyState === WebSocket.OPEN) sendJson(connection.join, payload);
        else await enqueueSignal(connection, "join", payload);
        return;
      }

      if (message.type === "declineJoin" && typeof message.session === "string") {
        const connection = joins.get(message.session);
        if (connection?.host !== socket) return;
        const payload = protocolMessage("declineJoin", {
          session: message.session,
          reason: typeof message.reason === "string" ? message.reason : "WebRTCError",
        });
        if (connection.join?.readyState === WebSocket.OPEN) sendJson(connection.join, payload);
        else await enqueueSignal(connection, "join", payload);
        cleanupJoin(message.session);
        return;
      }

      if (message.type === "joinDisconnect" && typeof message.session === "string") {
        const connection = joins.get(message.session);
        if (connection?.host === socket) cleanupJoin(message.session);
      }
    })().catch(error => {
      console.error("[PolyTrack multiplayer] Host message failed", error);
    });
  });

  socket.on("close", () => {
    if (room) cleanupRoom(room);
  });
}

function handleJoin(socket: WebSocket) {
  let session: string | null = null;

  socket.on("message", raw => {
    void (async () => {
      const message = parseMessage(raw);
      if (!message) {
        socket.close(1008, "Malformed protocol message");
        return;
      }

      if (!session) {
        const inviteCode = typeof message.inviteCode === "string" ? message.inviteCode.toUpperCase() : "";
        const localRoom = rooms.get(inviteCode);
        const sharedRoom = localRoom ?? await getMultiplayerRoom(inviteCode);
        if (!sharedRoom || ("host" in sharedRoom && sharedRoom.host.readyState !== WebSocket.OPEN)) {
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
        const connection: JoinConnection = {
          session,
          inviteCode,
          host: localRoom?.host ?? null,
          join: socket,
          persistent: Boolean(!localRoom),
        };
        joins.set(session, connection);
        if (localRoom) localRoom.joins.set(session, socket);
        else persistentJoinConnections.set(session, connection);

        if (localRoom) {
          await sendJoinInvite(localRoom, session, message);
        } else {
          const queued = await enqueueMultiplayerSignal({
            inviteCode,
            session,
            recipient: "host",
            payload: JSON.stringify({ type: "joinRequest", ...message }),
          });
          if (!queued) {
            cleanupJoin(session);
            sendJson(socket, protocolMessage("error", { error: "ServerUnavailable" }));
            socket.close();
          }
        }
        return;
      }

      const connection = joins.get(session);
      if (!connection || connection.join !== socket) return;
      if (message.type === "candidate") {
        await enqueueSignal(connection, "host", protocolMessage("candidate", {
          candidate: message.candidate ?? null,
        }));
      }
    })().catch(error => {
      console.error("[PolyTrack multiplayer] Join message failed", error);
    });
  });

  socket.on("close", () => {
    if (!session) return;
    const connection = joins.get(session);
    if (connection) {
      void enqueueSignal(connection, "host", protocolMessage("joinDisconnect", { session }));
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

  const signalTimer = setInterval(() => void processPersistentSignals(), SIGNAL_POLL_INTERVAL_MS);
  signalTimer.unref();
  const cleanupTimer = setInterval(() => {
    expireRooms();
    void pruneMultiplayerState();
  }, 60_000);
  cleanupTimer.unref();
  console.log("PolyTrack multiplayer signaling enabled on /v6/multiplayer/{host,join}");
}
