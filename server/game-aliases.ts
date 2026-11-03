import type { Express, Request, Response } from "express";
import path from "node:path";

const publicGamesRoot = path.resolve(process.cwd(), "client/public/jeux");
const aliases = new Set(["selection", "fauxpas", "rng"]);

/** Serve the existing game files through clean top-level URLs. */
export function registerGameAliases(app: Express) {
  app.get(/^\/(selection|fauxpas|rng)(?:\/(.*))?$/, (req: Request, res: Response) => {
    const match = req.path.match(/^\/(selection|fauxpas|rng)(?:\/(.*))?$/);
    if (!match || !aliases.has(match[1])) {
      res.status(404).end();
      return;
    }
    const section = match[1] === "selection" ? "" : match[1];
    const relative = match[2] || "index.html";
    const target = path.resolve(publicGamesRoot, section, relative);
    const root = path.resolve(publicGamesRoot, section);
    if (!target.startsWith(`${root}${path.sep}`) || target.includes("..")) {
      res.status(400).json({ error: "Invalid game path" });
      return;
    }
    res.sendFile(target);
  });
}
