import ToolNav from "@/app/components/ToolNav";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MIN_REVIEWS_FOR_AVERAGE = 3;

type RankedUser = {
  username: string;
  displayName: string;
  reviewCount: number;
  averageScore: number | null;
  rank: number;
};

export default async function RankingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="page">
        <ToolNav />
        <h1>クラブランキング</h1>
        <div className="card">
          <p>このページを使うにはログインが必要です。</p>
          <form action={async () => { "use server"; await signIn("annict", { redirectTo: "/ranking" }); }}>
            <button type="submit" className="primary">Annictでログイン</button>
          </form>
        </div>
      </div>
    );
  }

  const [users, reviewStats] = await prisma.$transaction([
    prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
      },
    }),
    prisma.review.groupBy({
      by: ["userId"],
      _count: { _all: true },
      _avg: { score: true },
    }),
  ]);

  const statsByUserId = new Map(reviewStats.map((stats) => [stats.userId, stats]));

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

  const mostReviews = rankUsers(
    rankedUsers
      .filter((user) => user.reviewCount > 0)
      .sort((a, b) => b.reviewCount - a.reviewCount || a.username.localeCompare(b.username)),
    (user) => user.reviewCount,
  );
  const highestAverages = rankUsers(
    rankedUsers
      .filter((user) => user.reviewCount >= MIN_REVIEWS_FOR_AVERAGE && user.averageScore !== null)
      .sort(
        (a, b) =>
          (b.averageScore ?? 0) - (a.averageScore ?? 0) ||
          b.reviewCount - a.reviewCount ||
          a.username.localeCompare(b.username),
      ),
    (user) => user.averageScore,
  );

  return (
    <div className="page">
      <ToolNav />
      <h1>クラブランキング</h1>
      <p className="lede">クラブのみんなの採点記録を集計しました。</p>

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
        renderValue={(user) => `${user.averageScore?.toFixed(2)}/10（${user.reviewCount}作品）`}
      />
    </div>
  );
}

function rankUsers(users: RankedUser[], getValue: (user: RankedUser) => number | null) {
  let rank = 0;

  return users.map((user, index) => {
    if (index === 0 || getValue(user) !== getValue(users[index - 1])) {
      rank = index + 1;
    }

    return { ...user, rank };
  });
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
        <p className="ranking-empty">まだランキングに表示できる採点がありません。</p>
      ) : (
        <div className="ranking-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">順位</th>
                <th scope="col">ユーザー</th>
                <th scope="col" className="ranking-value">{valueLabel}</th>
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
