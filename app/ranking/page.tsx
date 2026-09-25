import ToolNav from "@/app/components/ToolNav";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

const MIN_REVIEWS_FOR_AVERAGE = 3;
const POPULAR_SCORE_THRESHOLD = 7;

type RankedUser = {
  username: string;
  displayName: string;
  reviewCount: number;
  averageScore: number | null;
  rank: number;
};
type RankedWork = {
  id: string;
  title: string;
  positiveCount: number;
  reviewCount: number;
  averageScore: number;
  rank: number;
};

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; cour?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="page">
        <ToolNav />
        <h1>クラブランキング</h1>
        <div className="card">
          <p>このページを使うにはログインが必要です。</p>
          <form
            action={async () => {
              "use server";
              await signIn("annict", { redirectTo: "/ranking" });
            }}
          >
            <button type="submit" className="primary">
              Annictでログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  const [{ group: requestedGroupId, cour }, memberships] = await Promise.all([
    searchParams,
    prisma.groupMember.findMany({
      where: { userId: session.user.id },
      include: { group: true },
      orderBy: { group: { name: "asc" } },
    }),
  ]);
  const selectedMembership = memberships.find(
    (membership) => membership.groupId === requestedGroupId,
  );
  if (requestedGroupId && !selectedMembership) redirect("/ranking");
  const selectedGroupId = selectedMembership?.groupId;
  const selectedGroup = selectedMembership?.group;
  const memberFilter = selectedGroupId
    ? { groupMembers: { some: { groupId: selectedGroupId } } }
    : {};

  const users = await prisma.user.findMany({
    where: memberFilter,
    select: { id: true, username: true, name: true },
  });
  const userIds = users.map((user) => user.id);
  const reviewWhere = selectedGroupId ? { userId: { in: userIds } } : {};
  const [reviewStats, reviews] = await Promise.all([
    prisma.review.groupBy({
      by: ["userId"],
      where: reviewWhere,
      _count: { _all: true },
      _avg: { score: true },
    }),
    prisma.review.findMany({
      where: reviewWhere,
      select: {
        score: true,
        work: {
          select: { id: true, title: true, seasonName: true, seasonYear: true },
        },
      },
    }),
  ]);

  const statsByUserId = new Map(
    reviewStats.map((stats) => [stats.userId, stats]),
  );
  const rankedUsers: RankedUser[] = users.map((user) => {
    const stats = statsByUserId.get(user.id);
    return {
      username: user.username,
      displayName: user.name || `@${user.username}`,
      reviewCount: stats?._count._all ?? 0,
      averageScore: stats?._avg.score ?? null,
      rank: 0,
    };
  });
  const mostReviews = rankItems(
    rankedUsers
      .filter((user) => user.reviewCount > 0)
      .sort(
        (a, b) =>
          b.reviewCount - a.reviewCount || a.username.localeCompare(b.username),
      ),
    (user) => user.reviewCount,
  );
  const highestAverages = rankItems(
    rankedUsers
      .filter(
        (user) =>
          user.reviewCount >= MIN_REVIEWS_FOR_AVERAGE &&
          user.averageScore !== null,
      )
      .sort(
        (a, b) =>
          (b.averageScore ?? 0) - (a.averageScore ?? 0) ||
          b.reviewCount - a.reviewCount ||
          a.username.localeCompare(b.username),
      ),
    (user) => user.averageScore,
  );

  const seasonMap = new Map<string, { year: number; name: string }>();
  for (const { work } of reviews) {
    if (work.seasonYear !== null && work.seasonName)
      seasonMap.set(`${work.seasonYear}:${work.seasonName}`, {
        year: work.seasonYear,
        name: work.seasonName,
      });
  }
  const seasons = [...seasonMap.entries()].sort(
    ([, a], [, b]) =>
      b.year - a.year || seasonOrder(b.name) - seasonOrder(a.name),
  );
  const selectedSeason = cour ? seasonMap.get(cour) : undefined;
  if (cour && !selectedSeason) {
    redirect(
      selectedGroupId
        ? `/ranking?group=${encodeURIComponent(selectedGroupId)}`
        : "/ranking",
    );
  }
  const workStats = new Map<string, Omit<RankedWork, "rank">>();
  for (const review of reviews) {
    if (
      selectedSeason &&
      (review.work.seasonYear !== selectedSeason.year ||
        review.work.seasonName !== selectedSeason.name)
    )
      continue;
    const stats = workStats.get(review.work.id) ?? {
      id: review.work.id,
      title: review.work.title,
      positiveCount: 0,
      reviewCount: 0,
      averageScore: 0,
    };
    stats.averageScore =
      (stats.averageScore * stats.reviewCount + review.score) /
      (stats.reviewCount + 1);
    stats.reviewCount += 1;
    if (review.score >= POPULAR_SCORE_THRESHOLD) stats.positiveCount += 1;
    workStats.set(review.work.id, stats);
  }
  const popularWorks = rankItems(
    [...workStats.values()]
      .filter((work) => work.positiveCount > 0)
      .sort(
        (a, b) =>
          b.positiveCount - a.positiveCount ||
          b.averageScore - a.averageScore ||
          b.reviewCount - a.reviewCount ||
          a.title.localeCompare(b.title),
      ),
    (work) => work.positiveCount,
  );

  return (
    <div className="page">
      <ToolNav />
      <h1>クラブランキング</h1>
      <p className="lede">
        {selectedGroup
          ? `${selectedGroup.name}の採点記録を集計しました。`
          : "登録ユーザー全体の採点記録を集計しました。"}
      </p>
      <form method="get" className="card filter-form">
        <div className="field">
          <label htmlFor="ranking-group">集計するグループ</label>
          <select
            id="ranking-group"
            name="group"
            defaultValue={selectedGroupId ?? ""}
          >
            <option value="">全体</option>
            {memberships.map(({ group }) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="primary">
          切り替える
        </button>
      </form>
      <RankingCard
        title="最多採点数"
        users={mostReviews}
        valueLabel="採点数"
        renderValue={(user) => `${user.reviewCount}作品`}
      />
      <RankingCard
        title="平均スコアが高い人"
        note={`${MIN_REVIEWS_FOR_AVERAGE}作品以上を採点した人が対象です。`}
        users={highestAverages}
        valueLabel="平均スコア"
        renderValue={(user) =>
          `${user.averageScore?.toFixed(2)}/10（${user.reviewCount}作品）`
        }
      />

      <section className="card ranking-card">
        <div className="ranking-heading">
          <h2>人気作品</h2>
          <form method="get">
            <input type="hidden" name="group" value={selectedGroupId ?? ""} />
            <label htmlFor="cour" className="sr-only">
              クール
            </label>
            <select
              id="cour"
              name="cour"
              defaultValue={selectedSeason ? cour : ""}
            >
              <option value="">全クール</option>
              {seasons.map(([key, season]) => (
                <option key={key} value={key}>
                  {season.year}年 {seasonLabel(season.name)}
                </option>
              ))}
            </select>
            <button type="submit" className="secondary">
              絞り込む
            </button>
          </form>
        </div>
        <p className="ranking-note">
          {POPULAR_SCORE_THRESHOLD}点以上を付けた人数で集計しています。
        </p>
        {popularWorks.length === 0 ? (
          <p className="ranking-empty">条件に合う作品がまだありません。</p>
        ) : (
          <div className="ranking-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">順位</th>
                  <th scope="col">作品</th>
                  <th scope="col" className="ranking-value">
                    高評価
                  </th>
                </tr>
              </thead>
              <tbody>
                {popularWorks.map((work) => (
                  <tr key={work.id}>
                    <td className="ranking-position">{work.rank}</td>
                    <td>{work.title}</td>
                    <td className="ranking-value">
                      {work.positiveCount}人（平均{work.averageScore.toFixed(2)}
                      ）
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function rankItems<T>(
  items: T[],
  getValue: (item: T) => number | null,
): Array<T & { rank: number }> {
  let rank = 0;
  return items.map((item, index) => {
    if (index === 0 || getValue(item) !== getValue(items[index - 1]))
      rank = index + 1;
    return { ...item, rank };
  });
}
function seasonOrder(name: string) {
  return (
    ({ WINTER: 1, SPRING: 2, SUMMER: 3, AUTUMN: 4 } as Record<string, number>)[
      name
    ] ?? 0
  );
}
function seasonLabel(name: string) {
  return (
    (
      { WINTER: "冬", SPRING: "春", SUMMER: "夏", AUTUMN: "秋" } as Record<
        string,
        string
      >
    )[name] ?? name
  );
}

function RankingCard({
  title,
  note,
  users,
  valueLabel,
  renderValue,
}: {
  title: string;
  note?: string;
  users: RankedUser[];
  valueLabel: string;
  renderValue: (user: RankedUser) => string;
}) {
  return (
    <section className="card ranking-card">
      <h2>{title}</h2>
      {note && <p className="ranking-note">{note}</p>}
      {users.length === 0 ? (
        <p className="ranking-empty">
          まだランキングに表示できる採点がありません。
        </p>
      ) : (
        <div className="ranking-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">順位</th>
                <th scope="col">ユーザー</th>
                <th scope="col" className="ranking-value">
                  {valueLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.username}>
                  <td className="ranking-position">{user.rank}</td>
                  <td>{user.displayName}</td>
                  <td className="ranking-value">{renderValue(user)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
