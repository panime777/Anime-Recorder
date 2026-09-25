import { describe, expect, it } from "vitest";
import { collectWatchedWorks, getDateRange, type Activity, type WatchedWork } from "@/lib/watched-list";

const { start, end } = getDateRange("2026-08-01", "2026-08-31");
const activity = (id: number, title: string, date = "2026-08-20T12:00:00") => ({
  action: "create_status", created_at: date,
  work: { id, title }, status: { kind: "watched" },
});

describe("watched list", () => {
  it("keeps distinct works with the same title and deduplicates IDs across pages", () => {
    const works = new Map<number, WatchedWork>();
    collectWatchedWorks([activity(1, "同名作品"), activity(2, "同名作品")], start, end, works);
    collectWatchedWorks([activity(1, "同名作品", "2026-08-10T12:00:00")], start, end, works);
    expect([...works.keys()]).toEqual([1, 2]);
    expect(works.get(1)?.createdAt).toBe("2026-08-20T12:00:00");
  });

  it("includes both date boundaries and excludes newer events", () => {
    const works = new Map<number, WatchedWork>();
    collectWatchedWorks([
      activity(3, "new", "2026-09-01T00:00:00"),
      activity(2, "last", "2026-08-31T23:59:59.999"),
      activity(1, "first", "2026-08-01T00:00:00"),
    ], start, end, works);
    expect([...works.keys()]).toEqual([2, 1]);
  });

  it("stops on old activities even if they are not watched statuses", () => {
    const works = new Map<number, WatchedWork>();
    const events: Activity[] = [{ action: "create_record", created_at: "2026-07-31T12:00:00" }];
    expect(collectWatchedWorks(events, start, end, works)).toBe(true);
    expect(works.size).toBe(0);
  });

  it("ignores missing work and status associations", () => {
    const works = new Map<number, WatchedWork>();
    collectWatchedWorks([
      { ...activity(1, "missing status"), status: null },
      { ...activity(2, "missing work"), work: null },
    ], start, end, works);
    expect(works.size).toBe(0);
  });

  it.each([["", "2026-08-01"], ["2026-02-30", "2026-08-01"], ["2026-08-02", "2026-08-01"]])(
    "rejects invalid or reversed date ranges (%s, %s)", (from, to) => {
      expect(() => getDateRange(from, to)).toThrow();
    },
  );
});
