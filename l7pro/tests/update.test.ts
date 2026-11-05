import { describe, expect, it } from "vitest";
import { RELEASES_URL, checkForUpdate, isNewer, parseVersion } from "../src/core/update.js";

const answer = (body: unknown, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });

describe("version comparison", () => {
  it("parses plain dotted versions with or without v", () => {
    expect(parseVersion("v1.0.3")).toEqual([1, 0, 3]);
    expect(parseVersion("2.10")).toEqual([2, 10]);
    expect(parseVersion("1.0.3-beta")).toBeNull();
    expect(parseVersion("latest")).toBeNull();
  });

  it("compares numerically, not as text", () => {
    expect(isNewer("v1.0.10", "1.0.9")).toBe(true);
    expect(isNewer("1.1.0", "1.0.99")).toBe(true);
    expect(isNewer("1.0.3", "1.0.3")).toBe(false);
    expect(isNewer("1.0.2", "1.0.3")).toBe(false);
    expect(isNewer("1.0", "1.0.0")).toBe(false);
    expect(isNewer("garbage", "1.0.0")).toBe(false);
  });
});

describe("checkForUpdate", () => {
  it("reports a newer release with its page", async () => {
    const page = `${RELEASES_URL}/tag/v1.0.4`;
    const info = await checkForUpdate("1.0.3", answer({ tag_name: "v1.0.4", html_url: page }));
    expect(info).toEqual({ current: "1.0.3", latest: "1.0.4", available: true, url: page });
  });

  it("reports up to date when the versions match", async () => {
    const info = await checkForUpdate("1.0.3", answer({ tag_name: "v1.0.3" }));
    expect(info.available).toBe(false);
    expect(info.url).toBe(RELEASES_URL);
  });

  it("never opens a page outside our repository", async () => {
    const info = await checkForUpdate("1.0.3", answer({ tag_name: "v1.0.4", html_url: "https://evil.example/x" }));
    expect(info.url).toBe(RELEASES_URL);
  });

  it("turns network and server failures into one readable error", async () => {
    const down = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(checkForUpdate("1.0.3", down)).rejects.toThrow("Could not reach GitHub");
    await expect(checkForUpdate("1.0.3", answer({}, false, 403))).rejects.toThrow("Could not reach GitHub");
  });

  it("rejects an answer without a usable version", async () => {
    await expect(checkForUpdate("1.0.3", answer({ tag_name: "nightly" }))).rejects.toThrow("unexpected answer");
    await expect(checkForUpdate("1.0.3", answer(null))).rejects.toThrow("unexpected answer");
  });
});
