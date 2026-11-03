import type { Express, Request, Response } from "express";

const RNG_API_ORIGIN = "https://db.rng-infinite.com";

/**
 * Relays only RNG's public /api/* endpoints through Agenda's own origin.
 * The upstream origin is fixed; this is not an open proxy and never accepts a URL from the client.
 */
export function registerRngApiProxy(app: Express) {
  app.use("/rng-api", async (req: Request, res: Response) => {
    const upstreamPath = req.originalUrl.replace(/^\/rng-api/, "");
    if (!upstreamPath.startsWith("/api/")) {
      res.status(404).json({ error: "Unknown RNG API path" });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const upstream = await fetch(`${RNG_API_ORIGIN}${upstreamPath}`, {
        method: req.method,
        headers: hasBody
          ? { "content-type": "application/json", accept: "application/json" }
          : { accept: "application/json" },
        body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
        signal: controller.signal,
      });
      const contentType = upstream.headers.get("content-type") || "application/json";
      res.status(upstream.status).setHeader("content-type", contentType);
      res.send(await upstream.text());
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError"
        ? "RNG server timeout"
        : "RNG server unavailable";
      res.status(502).json({ error: message });
    } finally {
      clearTimeout(timeout);
    }
  });
}
