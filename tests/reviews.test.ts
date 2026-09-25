import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), fetchWork: vi.fn(), findUser: vi.fn(),
  transaction: vi.fn(), workUpsert: vi.fn(), reviewUpsert: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/annict-user", () => ({ fetchWork: mocks.fetchWork }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: mocks.findUser }, $transaction: mocks.transaction,
} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { POST } from "@/app/api/reviews/route";

const canonicalWork = {
  annictId: 123, title: "Annictの作品名", imageUrl: "https://example.com/official.jpg",
  seasonName: "SUMMER", seasonYear: 2026,
};
const payload = { annictId: 123, score: 8, tags: [" 日常 ", "日常", ""], comment: " 感想 " };
const request = (body: unknown) => new Request("https://example.com/api/reviews", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "current-user" } });
  mocks.findUser.mockResolvedValue({ accessToken: "user-token" });
  mocks.fetchWork.mockResolvedValue(canonicalWork);
  mocks.workUpsert.mockResolvedValue({ id: "work-id" });
  mocks.transaction.mockImplementation(async (callback) => callback({
    work: { upsert: mocks.workUpsert }, review: { upsert: mocks.reviewUpsert },
  }));
});

describe("POST /api/reviews", () => {
  it("ignores forged shared metadata and binds the review to the authenticated user", async () => {
    const response = await POST(request({ ...payload,
      title: "改ざんされた名前", imageUrl: "https://example.com/tracker",
      seasonName: "WINTER", seasonYear: 1900, userId: "other-user",
    }));
    expect(response.status).toBe(200);
    expect(mocks.fetchWork).toHaveBeenCalledWith("user-token", 123);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.workUpsert).toHaveBeenCalledWith({
      where: { annictId: 123 }, update: canonicalWork, create: canonicalWork,
    });
    expect(mocks.reviewUpsert).toHaveBeenCalledWith({
      where: { userId_workId: { userId: "current-user", workId: "work-id" } },
      update: { score: 8, tags: ["日常"], comment: "感想" },
      create: { userId: "current-user", workId: "work-id", score: 8, tags: ["日常"], comment: "感想" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("requires authentication before looking up or writing data", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request(payload))).status).toBe(401);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    { annictId: 2147483648 }, { annictId: -1 }, { annictId: 1.5 },
    { score: 11 }, { score: -1 }, { score: 4.5 }, { score: "8" },
    { tags: [123] }, { comment: 123 },
  ])("rejects invalid input before touching Annict or the database: %j", async (invalid) => {
    expect((await POST(request({ ...payload, ...invalid }))).status).toBe(400);
    expect(mocks.fetchWork).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns 404 without writes when Annict does not know the work", async () => {
    mocks.fetchWork.mockResolvedValue(null);
    expect((await POST(request(payload))).status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not fall back to client metadata during an Annict outage", async () => {
    mocks.fetchWork.mockRejectedValue(new Error("upstream failed"));
    expect((await POST(request({ ...payload, title: "untrusted" }))).status).toBe(502);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not report success or invalidate pages when the transaction fails", async () => {
    mocks.reviewUpsert.mockRejectedValue(new Error("write failed"));
    await expect(POST(request(payload))).rejects.toThrow("write failed");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
