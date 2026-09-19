import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("agenda escape-game gate", () => {
  const html = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");

  it("contains the Monday puzzle and the PolyTrack unlock condition", () => {
    expect(html).toContain("Agenda personnel");
    expect(html).toContain("Note privée · lundi");
    expect(html).toContain("name=\"unlock\"");
    expect(html).toContain("input.value.trim().toLowerCase() === 'polytrack'");
    expect(html).toContain("gate.remove()");
  });
});
