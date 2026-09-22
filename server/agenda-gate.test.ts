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

  it("contains the Monday puzzle and the PolyTrack unlock condition", () => {
    expect(html).toContain("Agenda personnel");
    expect(html).not.toContain("Café avec Marie");
    expect(html).toContain("data-date=\"2026-09-07\"");
    expect(html).toContain("id=\"editor-backdrop\"");
    expect(html).toContain("localStorage.setItem(labelFor(activeDay), value)");
    expect(html).toContain("value.toLowerCase() === 'polytrack'");
    expect(html).toContain("agenda-empty-note-1");
    expect(html).toContain("loadScript('main.bundle.js?v=agenda-weekly-profile-fix-1')");
    expect(html).toContain("polytrack_v5_prod_user_");
    expect(html).toContain("fetch('/v6/user'");
    expect(html).toContain("getContext('webgl2')");
    expect(html).toContain("gate.remove()");
  });

  it("labels calendar cells and keeps the official PolyTrack service links", () => {
    expect(html).toContain("7 lundi");
    expect(html).toContain("8 mardi");
    expect(html).toContain("30 mercredi");
    expect(html).toContain("Vue mensuelle");
    expect(html).not.toContain("Classements · temps · map de la semaine");
    expect(polytrackBundle).toContain("location.origin+\"/\"");
    expect(polytrackBundle).toContain("multiplayer/join");
    expect(polytrackBundle).toContain("location.host");
    expect(polytrackApi).toContain('const POLYTRACK_ORIGIN = "https://vps.kodub.com"');
    expect(polytrackApi).toContain('origin: "https://www.kodub.com"');
    expect(polytrackApi).not.toContain("play.kodub.com");
  });

  it("uses Agenda as the Manus project title", () => {
    expect(projectConfig).toContain('"VITE_APP_TITLE": "Agenda"');
    expect(projectConfig).not.toContain('"VITE_APP_TITLE": "Agenda PolyTrack"');
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
    expect(multiplayerSource).toContain("const JOIN_ATTEMPT_TTL_MS = 35 * 1000");
    expect(multiplayerSource).toContain("armJoinAttemptTimeout(connection)");
  });
});
