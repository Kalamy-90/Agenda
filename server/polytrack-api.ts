import type { Express, Request, Response } from "express";

const POLYTRACK_ORIGIN = "https://vps.kodub.com";
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

function getPublicOrigin(req: Request) {
  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || req.protocol;
  const host = forwardedHost || req.get("host");
  return `${protocol}://${host}`;
}

export function rewriteResponseUrls(value: unknown, publicOrigin: string): unknown {
  if (typeof value === "string") {
    return value.startsWith(`${POLYTRACK_ORIGIN}/`)
      ? value.slice(POLYTRACK_ORIGIN.length)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(item => rewriteResponseUrls(item, publicOrigin));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        rewriteResponseUrls(item, publicOrigin),
      ]),
    );
  }
  return value;
}

async function readBody(req: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("PolyTrack request body is too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function copyResponseHeaders(upstream: globalThis.Response, res: Response) {
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });
}

function getUpstreamUrl(req: Request) {
  const query = new URL(req.originalUrl, "http://agenda.local");
  const userToken = query.searchParams.get("userToken");
  if (userToken !== null) {
    query.searchParams.set("userToken", userToken.trim());
  }
  return `${POLYTRACK_ORIGIN}/v6${req.path}${query.search}`;
}

export function normalizePolyTrackBody(body: string, contentType: string | undefined) {
  if (!contentType?.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return body;
  }
  const form = new URLSearchParams(body);
  const userToken = form.get("userToken");
  if (userToken !== null) {
    form.set("userToken", userToken.trim());
  }
  return form.toString();
}

async function relayPolyTrackRequest(req: Request, res: Response) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const upstreamUrl = getUpstreamUrl(req);
  const headers: Record<string, string> = {
    accept: req.get("accept") || "application/json, text/plain, */*",
    origin: "https://www.kodub.com",
    referer: "https://www.kodub.com/",
    "user-agent": "Agenda relay/1.0",
  };
  const contentType = req.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const buffer = await readBody(req);
    body = buffer.length > 0
      ? normalizePolyTrackBody(buffer.toString("utf8"), contentType)
      : undefined;
  }

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
    redirect: "follow",
  });
  const responseBuffer = Buffer.from(await upstream.arrayBuffer());
  copyResponseHeaders(upstream, res);

  const responseType = upstream.headers.get("content-type") || "";
  if (responseType.includes("application/json")) {
    try {
      const payload = JSON.parse(responseBuffer.toString("utf8"));
      res.status(upstream.status).type("application/json").send(
        JSON.stringify(rewriteResponseUrls(payload, getPublicOrigin(req))),
      );
      return;
    } catch {
      // Return the upstream bytes unchanged when a server error is not JSON.
    }
  }

  res.status(upstream.status).send(responseBuffer);
}

export function registerPolyTrackApi(app: Express) {
  app.use("/v6", (req, res, next) => {
    if (req.path === "/iceServers") {
      next();
      return;
    }
    relayPolyTrackRequest(req, res).catch(error => {
      const message = error instanceof Error ? error.message : "PolyTrack relay failed";
      if (message.includes("too large")) {
        res.status(413).json({ error: message });
        return;
      }
      console.error("[PolyTrack API]", error);
      if (!res.headersSent) {
        res.status(502).json({ error: "PolyTrack server unavailable" });
      } else {
        next(error);
      }
    });
  });
}
