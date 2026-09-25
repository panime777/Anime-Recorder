import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { fetchFollowing, fetchWork } from "@/lib/annict-user";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());
const respond = (body: unknown) => fetchMock.mockResolvedValueOnce(Response.json(body));
const page = (usernames: string[], hasNextPage: boolean, endCursor: string | null) => ({
  data: { viewer: { following: {
    nodes: usernames.map((username) => ({ username, name: null })),
    pageInfo: { hasNextPage, endCursor },
  } } },
});

describe("Annict following pagination", () => {
  it("retrieves followers past the first 50 and removes duplicates", async () => {
    const first = Array.from({ length: 50 }, (_, i) => `user${i}`);
    respond(page(first, true, "cursor1"));
    respond(page(["user49", "user50"], false, null));
    const people = await fetchFollowing("token");
    expect(people).toHaveLength(51);
    expect(people.at(-1)?.username).toBe("user50");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).variables).toEqual({ after: "cursor1" });
  });

  it.each([null, "a"])("rejects missing or repeated cursors (%s)", async (cursor) => {
    respond(page(["user1"], true, "a"));
    respond(page(["user2"], true, cursor));
    await expect(fetchFollowing("token")).rejects.toThrow("invalid cursor");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("detects multi-page cursor cycles", async () => {
    for (const cursor of ["a", "b", "a"]) respond(page([], true, cursor));
    await expect(fetchFollowing("token")).rejects.toThrow("invalid cursor");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails on upstream errors instead of returning an apparently complete list", async () => {
    respond(page(["user1"], true, "a"));
    respond({ errors: [{ message: "rate limited" }] });
    await expect(fetchFollowing("token")).rejects.toThrow("request failed");
  });
});

describe("trusted work lookup", () => {
  it("reads metadata from Annict and uses the image fallback", async () => {
    respond({ data: { searchWorks: { nodes: [{
      annictId: 123, title: "公式タイトル", seasonName: "SUMMER", seasonYear: 2026,
      image: { recommendedImageUrl: null, facebookOgImageUrl: "https://example.com/og.jpg" },
    }] } } });
    expect(await fetchWork("token", 123)).toEqual({
      annictId: 123, title: "公式タイトル", seasonName: "SUMMER", seasonYear: 2026,
      imageUrl: "https://example.com/og.jpg",
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables).toEqual({ annictIds: [123] });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer token");
  });

  it("returns null only for a successful empty result", async () => {
    respond({ data: { searchWorks: { nodes: [] } } });
    expect(await fetchWork("token", 123)).toBeNull();
  });

  it.each([
    { errors: [{ message: "failed" }] },
    { data: {} },
    { data: { searchWorks: { nodes: [{ annictId: 999, title: "wrong work" }] } } },
  ])("rejects unsuccessful or mismatched responses", async (response) => {
    respond(response);
    await expect(fetchWork("token", 123)).rejects.toThrow();
  });
});
