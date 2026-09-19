import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("agenda escape-game gate", () => {
  const html = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");

  it("contains the Monday puzzle and the PolyTrack unlock condition", () => {
    expect(html).toContain("Agenda personnel");
    expect(html).not.toContain("Café avec Marie");
    expect(html).toContain("data-date=\"2026-09-07\"");
    expect(html).toContain("id=\"editor-backdrop\"");
    expect(html).toContain("localStorage.setItem(labelFor(activeDay), value)");
    expect(html).toContain("value.toLowerCase() === 'polytrack'");
    expect(html).toContain("agenda-empty-note-1");
    expect(html).toContain("loadScript('main.bundle.js?v=agenda-empty-2')");
    expect(html).toContain("getContext('webgl2')");
    expect(html).toContain("gate.remove()");
  });
});
