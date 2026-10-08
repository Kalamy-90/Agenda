import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("agenda escape-game gate", () => {
  const html = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");
  const polytrackBundle = readFileSync(
    resolve(process.cwd(), "client/public/main.bundle.js"),
    "utf8",
  );
  const polytrackApi = readFileSync(
    resolve(process.cwd(), "server/polytrack-api.ts"),
    "utf8",
  );
  const multiplayerSource = readFileSync(
    resolve(process.cwd(), "server/multiplayer.ts"),
    "utf8",
  );
  const projectConfig = readFileSync(
    resolve(process.cwd(), ".project-config.json"),
    "utf8",
  );
  const gamesPage = readFileSync(
    resolve(process.cwd(), "client/public/jeux/index.html"),
    "utf8",
  );
  const fauxPasPage = readFileSync(
    resolve(process.cwd(), "client/public/jeux/fauxpas/index.html"),
    "utf8",
  );
  const fauxPasTabletPage = readFileSync(
    resolve(process.cwd(), "client/public/jeux/fauxpas/tablette.html"),
    "utf8",
  );

  it("contains the Monday puzzle and the PolyTrack unlock condition", () => {
    expect(html).toContain("Agenda personnel");
    expect(html).not.toContain("Café avec Marie");
    expect(html).toContain('data-date="2026-10-05"');
    expect(html).toContain("id=\"editor-backdrop\"");
    expect(html).toContain("localStorage.setItem(labelFor(activeDay), value)");
    expect(html).toContain("keyword === 'polytrack'");
    expect(html).toContain("const TWITCH_URL = 'https://twitch-stream-player-776314629335.europe-west2.run.app'");
    expect(html).toContain("getDay() === 1 && keyword === 'twitch'");
    expect(html).toContain("window.open(TWITCH_URL, '_blank', 'noopener,noreferrer')");
    expect(html).toContain("const CHESS_URL = 'https://schoolschoolschool.com'");
    expect(html).toContain("getDay() === 1 && keyword === 'chess'");
    expect(html).toContain("window.open(CHESS_URL, '_blank', 'noopener,noreferrer')");
    expect(html).toContain("localStorage.removeItem(labelFor(activeDay));");
    expect(html).toContain("getDay() === 1 && keyword === 'jeu'");
    expect(html).toContain("window.location.href = '/jeux/index.html'");
    expect(html).toContain("agenda-empty-note-1");
    expect(html).toContain("loadScript('main.bundle.js?v=agenda-weekly-profile-fix-1')");
    expect(html).toContain("getContext('webgl2')");
    expect(html).toContain("gate.remove()");
    expect(html).toContain("sessionStorage.getItem('agenda-polytrack-active')");
    expect(html).toContain("sessionStorage.removeItem('agenda-polytrack-active')");
    expect(html).toContain("window.location.replace('/')");
    expect(html).toContain("sessionStorage.setItem('agenda-polytrack-active', '1')");
    expect(html).toContain("document.querySelector('.days').addEventListener('click'");
    expect(html).toContain("try { renderNote(day); } catch {}");
  });

  it("labels calendar cells and keeps the official PolyTrack service links", () => {
    expect(html).toContain("5");
    expect(html).toContain("31");
    expect(html).toContain("Octobre 2026");
    expect(html).toContain("Espace personnel · vue mensuelle");
    expect(html).not.toContain("Classements · temps · map de la semaine");
    expect(polytrackBundle).toContain("location.origin+\"/\"");
    expect(polytrackBundle).toContain("multiplayer/join");
    expect(polytrackBundle).toContain("location.host");
    expect(polytrackApi).toContain('const POLYTRACK_ORIGIN = "https://vps.kodub.com"');
    expect(polytrackApi).toContain('origin: "https://www.kodub.com"');
    expect(polytrackApi).not.toContain("play.kodub.com");
  });

  it("uses Agenda as the Manus project title", () => {
    expect(projectConfig).toContain('"VITE_APP_TITLE": "agenda"');
    expect(projectConfig).not.toContain('"VITE_APP_TITLE": "Agenda PolyTrack"');
  });

  it("offers FauxPas as the first mini-game", () => {
    expect(gamesPage).toContain("<title>Jeux · Agenda</title>");
    expect(gamesPage).toContain("<h1>Jeux</h1>");
    expect(gamesPage).toContain("<h2>FauxPas</h2>");
    expect(gamesPage).toContain('href="/jeux/fauxpas/index.html"');
    for (const page of [fauxPasPage, fauxPasTabletPage]) {
      expect(page).toContain("navigation?.type === 'reload'");
      expect(page).toContain("window.location.replace('/')");
    }
  });

  it("persists signaling so host and joiner can use different instances", () => {
    expect(multiplayerSource).toContain("createMultiplayerRoom");
    expect(multiplayerSource).toContain("enqueueMultiplayerSignal");
    expect(multiplayerSource).toContain("takeMultiplayerSignals");
    expect(multiplayerSource).toContain("processPersistentSignals");
    expect(multiplayerSource).toContain('!("type" in message) && "candidate" in message');
    expect(multiplayerSource.match(/!\("type" in message\) && "candidate" in message/g)).toHaveLength(2);
    expect(multiplayerSource).toContain('const HOST_ICE_MESSAGE_TYPE = "iceCandidate"');
    expect(multiplayerSource).toContain('protocolMessage(HOST_ICE_MESSAGE_TYPE, {\n          session,');
    expect(multiplayerSource).toContain('const JOIN_ATTEMPT_TTL_MS = 35 * 1000');
    expect(multiplayerSource).toContain("armJoinAttemptTimeout(connection)");
    expect(multiplayerSource).toContain("expireJoinAttempts();");
  });
});
