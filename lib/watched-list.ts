export interface Activity {
  action: string;
  created_at: string;
  work?: { id: number; title: string } | null;
  status?: { kind: string } | null;
}

export interface WatchedWork {
  id: number;
  createdAt: string;
  title: string;
}

function parseLocalDate(value: string, endOfDay = false): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日付を入力してください");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("有効な日付を入力してください");
  }
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

export function getDateRange(startDate: string, endDate: string) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate, true);
  if (start > end) throw new Error("終了日は開始日以降にしてください");
  return { start, end };
}

// Activities arrive newest first. Keep the latest watched event per work ID.
export function collectWatchedWorks(
  activities: Activity[],
  start: Date,
  end: Date,
  works: Map<number, WatchedWork>,
): boolean {
  for (const activity of activities) {
    const createdAt = new Date(activity.created_at);
    if (createdAt < start) return true;
    if (createdAt > end || !Number.isFinite(createdAt.getTime())) continue;
    if (activity.action !== "create_status" || activity.status?.kind !== "watched" || !activity.work) continue;
    if (!works.has(activity.work.id)) {
      works.set(activity.work.id, {
        id: activity.work.id,
        createdAt: activity.created_at,
        title: activity.work.title,
      });
    }
  }
  return false;
}
