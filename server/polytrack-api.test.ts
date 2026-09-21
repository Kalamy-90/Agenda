import { describe, expect, it } from "vitest";
import { normalizePolyTrackBody, rewriteResponseUrls } from "./polytrack-api";

describe("PolyTrack API relay", () => {
  it("rewrites nested official URLs to same-origin relay paths", () => {
    const result = rewriteResponseUrls(
      {
        trackUrl: "https://vps.kodub.com/v6/track?id=weekly",
        thumbnailUrl: "https://vps.kodub.com/assets/weekly.png",
        rows: [
          { recording: "https://vps.kodub.com/v6/recording/abc" },
          { nickname: "local-player" },
        ],
      },
      "https://agenda.example",
    );

    expect(result).toEqual({
      trackUrl: "/v6/track?id=weekly",
      thumbnailUrl: "/assets/weekly.png",
      rows: [
        { recording: "/v6/recording/abc" },
        { nickname: "local-player" },
      ],
    });
  });

  it("trims user tokens in profile form submissions", () => {
    const body = normalizePolyTrackBody(
      "version=0.6.3&userToken=%20765abc%20&nickname=Player",
      "application/x-www-form-urlencoded",
    );
    expect(body).toBe("version=0.6.3&userToken=765abc&nickname=Player");
  });
});
