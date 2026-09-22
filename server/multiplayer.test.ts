import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getIceServers,
  normalizeIceServers,
  resetIceServerCacheForTests,
} from "./multiplayer";

afterEach(() => {
  resetIceServerCacheForTests();
  vi.unstubAllGlobals();
});

describe("PolyTrack ICE servers", () => {
  it("keeps TURN credentials from the official response", () => {
    expect(normalizeIceServers([
      { urls: "stun:vps2.kodub.com:443" },
      {
        urls: ["turn:vps2.kodub.com:443", "turns:vps2.kodub.com:443"],
        username: "temporary-user",
        credential: "temporary-secret",
      },
    ])).toEqual([
      { urls: "stun:vps2.kodub.com:443" },
      {
        urls: [
          "turn:vps2.kodub.com:443",
          "turn:vps2.kodub.com:443?transport=udp",
          "turn:vps2.kodub.com:443?transport=tcp",
          "turns:vps2.kodub.com:443",
          "turns:vps2.kodub.com:443?transport=tcp",
        ],
        username: "temporary-user",
        credential: "temporary-secret",
      },
    ]);
  });

  it("fetches official ICE servers once per cache window", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        urls: "turn:vps2.kodub.com:443",
        username: "temporary-user",
        credential: "temporary-secret",
      },
    ]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getIceServers(1_000);
    const second = await getIceServers(1_001);

    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({
      urls: [
        "turn:vps2.kodub.com:443",
        "turn:vps2.kodub.com:443?transport=udp",
        "turn:vps2.kodub.com:443?transport=tcp",
      ],
      username: "temporary-user",
      credential: "temporary-secret",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to public STUN when the official service is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(getIceServers(1_000)).resolves.toEqual([
      { urls: "stun:stun.l.google.com:19302" },
    ]);
  });
});
