import ToolNav from "@/app/components/ToolNav";
import {
  fetchLibraryStatusCounts,
  fetchWatchedSeasonCounts,
  type LibraryStatusCounts,
} from "@/lib/annict-user";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface BarItem {
  label: string;
  value: number;
}

const SEASON_LABELS: Record<string, string> = {
  SPRING: "春",
  SUMMER: "夏",
  AUTUMN: "秋",
  WINTER: "冬",
};

function BarChart({ items }: { items: BarItem[] }) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="bar-chart">
      {items.map((item) => (
        <div className="bar-chart-row" key={item.label}>
          <span className="bar-chart-label">{item.label}</span>
          <div className="bar-chart-track" aria-hidden="true">
            <div className="bar-chart-bar" style={{ width: `${(item.value / maxValue) * 100}%` }} />
          </div>
          <span className="bar-chart-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function statusItems(counts: LibraryStatusCounts): BarItem[] {
  return [
    { label: "見たい", value: counts.wannaWatchCount },
    { label: "見てる", value: counts.watchingCount },
    { label: "見た", value: counts.watchedCount },
    { label: "一時中断", value: counts.onHoldCount },
    { label: "視聴中止", value: counts.stopWatchingCount },
  ];
}

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="page">
        <ToolNav />
        <h1>視聴統計</h1>
        <div className="card">
          <p>このページを使うにはログインが必要です。</p>
          <form action={async () => { "use server"; await signIn("annict", { redirectTo: "/stats" }); }}>
            <button type="submit" className="primary">Annictでログイン</button>
          </form>
        </div>
      </div>
    );
  }

  const [user, reviewsResult] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { accessToken: true } }),
    prisma.review.findMany({ where: { userId: session.user.id }, select: { tags: true } })
      .then((reviews) => ({ reviews, error: false as const }))
      .catch((error) => {
        console.error("Failed to load tag statistics", error);
        return { reviews: [], error: true as const };
      }),
  ]);

  if (!user) {
    return (
      <div className="page">
        <ToolNav />
        <h1>視聴統計</h1>
        <div className="card">ユーザー情報が見つかりません。再ログインしてください。</div>
      </div>
    );
  }

  const [statusResult, seasonsResult] = await Promise.allSettled([
    fetchLibraryStatusCounts(user.accessToken),
    fetchWatchedSeasonCounts(user.accessToken),
  ]);
  if (statusResult.status === "rejected") console.error("Failed to load library status statistics", statusResult.reason);
  if (seasonsResult.status === "rejected") console.error("Failed to load season statistics", seasonsResult.reason);

  const tagCounts = new Map<string, number>();
  for (const review of reviewsResult.reviews) {
    for (const tag of review.tags) {
      const normalized = tag.trim();
      if (normalized) tagCounts.set(normalized, (tagCounts.get(normalized) ?? 0) + 1);
    }
  }
  const tags = [...tagCounts].map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ja"))
    .slice(0, 10);
  const seasons = seasonsResult.status === "fulfilled"
    ? seasonsResult.value.slice(0, 10).map((season) => ({
        label: `${season.seasonYear}年${SEASON_LABELS[season.seasonName] ?? season.seasonName}`,
        value: season.count,
      }))
    : [];

  return (
    <div className="page">
      <ToolNav />
      <h1>視聴統計</h1>
      <p className="lede">Annictのライブラリと、ここで採点した記録を振り返ります。</p>

      <section className="card stats-card">
        <h2>ライブラリの状態</h2>
        <p className="stats-description">現在の作品ステータス別の登録数です。</p>
        {statusResult.status === "fulfilled" ? <BarChart items={statusItems(statusResult.value)} /> : (
          <p className="stats-error">Annictからライブラリの状態を取得できませんでした。時間をおいて再度お試しください。</p>
        )}
      </section>

      <section className="card stats-card">
        <h2>よく見たクール</h2>
        <p className="stats-description">視聴済み作品が多いクールの上位10件です。</p>
        {seasonsResult.status === "rejected" ? (
          <p className="stats-error">Annictからクール別の記録を取得できませんでした。時間をおいて再度お試しください。</p>
        ) : seasons.length ? <BarChart items={seasons} /> : <p className="stats-empty">クール情報のある視聴済み作品がありません。</p>}
      </section>

      <section className="card stats-card">
        <h2>よく使うタグ</h2>
        <p className="stats-description">採点した作品につけたタグの上位10件です。</p>
        {reviewsResult.error ? (
          <p className="stats-error">タグの記録を取得できませんでした。時間をおいて再度お試しください。</p>
        ) : tags.length ? <BarChart items={tags} /> : <p className="stats-empty">まだタグ付きの採点がありません。</p>}
      </section>
    </div>
  );
}
