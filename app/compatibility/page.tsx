import ToolNav from "@/app/components/ToolNav";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const HIGH_SCORE = 7;

type SearchParams = Promise<{ a?: string | string[]; b?: string | string[] }>;

type ComparedReview = {
  score: number;
  work: {
    id: string;
    title: string;
    imageUrl: string | null;
  };
};

function selectedValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function userLabel(user: { username: string; name: string | null }) {
  return user.name ? `${user.name} (@${user.username})` : `@${user.username}`;
}

function WorkList({
  reviews,
  emptyMessage,
}: {
  reviews: ComparedReview[];
  emptyMessage: string;
}) {
  if (reviews.length === 0) {
    return <p className="compatibility-empty">{emptyMessage}</p>;
  }

  return (
    <div className="compatibility-grid">
      {reviews.map((review) => (
        <article className="review-grid-item" key={review.work.id}>
          <div className="review-cover-frame">
            {review.work.imageUrl ? (
              // Work images come from Annict-managed URLs, which can use different CDN hosts.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="review-cover"
                src={review.work.imageUrl}
                alt={`${review.work.title}のカバー画像`}
                loading="lazy"
              />
            ) : (
              <div className="review-cover-placeholder" aria-hidden="true">No image</div>
            )}
            <span className="review-score">{review.score}/10</span>
          </div>
          <h3 className="review-title">{review.work.title}</h3>
        </article>
      ))}
    </div>
  );
}

export default async function CompatibilityPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="page">
        <ToolNav />
        <h1>メンバー相性診断</h1>
        <div className="card">
          <p>このページを使うにはログインが必要です。</p>
          <form action={async () => { "use server"; await signIn("annict", { redirectTo: "/compatibility" }); }}>
            <button type="submit" className="primary">Annictでログイン</button>
          </form>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const usernameA = selectedValue(params.a);
  const usernameB = selectedValue(params.b);
  const users = await prisma.user.findMany({
    select: { id: true, username: true, name: true },
    orderBy: [{ name: "asc" }, { username: "asc" }],
  });

  let message = "比較する2人を選んでください。";
  let result: null | {
    userA: (typeof users)[number];
    userB: (typeof users)[number];
    commonCount: number;
    commonFavorites: ComparedReview[];
    recommendationsFromA: ComparedReview[];
    recommendationsFromB: ComparedReview[];
  } = null;

  if (users.length < 2) {
    message = "相性を比較するには、登録ユーザーが2人以上必要です。";
  } else if (usernameA && usernameB) {
    if (usernameA === usernameB) {
      message = "異なる2人を選んでください。";
    } else {
      const userA = users.find((user) => user.username === usernameA);
      const userB = users.find((user) => user.username === usernameB);

      if (!userA || !userB) {
        message = "選択されたユーザーが見つかりません。登録ユーザーから選び直してください。";
      } else {
        const reviews = await prisma.review.findMany({
          where: { userId: { in: [userA.id, userB.id] } },
          select: {
            userId: true,
            score: true,
            work: { select: { id: true, title: true, imageUrl: true } },
          },
        });
        const reviewsA = reviews.filter((review) => review.userId === userA.id);
        const reviewsB = reviews.filter((review) => review.userId === userB.id);
        const byWorkA = new Map(reviewsA.map((review) => [review.work.id, review]));
        const byWorkB = new Map(reviewsB.map((review) => [review.work.id, review]));
        const byTitle = (left: ComparedReview, right: ComparedReview) =>
          left.work.title.localeCompare(right.work.title, "ja");

        result = {
          userA,
          userB,
          commonCount: reviewsA.filter((review) => byWorkB.has(review.work.id)).length,
          commonFavorites: reviewsA
            .filter((review) => review.score >= HIGH_SCORE && (byWorkB.get(review.work.id)?.score ?? -1) >= HIGH_SCORE)
            .sort(byTitle),
          recommendationsFromA: reviewsA
            .filter((review) => review.score >= HIGH_SCORE && !byWorkB.has(review.work.id))
            .sort(byTitle),
          recommendationsFromB: reviewsB
            .filter((review) => review.score >= HIGH_SCORE && !byWorkA.has(review.work.id))
            .sort(byTitle),
        };
      }
    }
  }

  return (
    <div className="page">
      <ToolNav />
      <h1>メンバー相性診断</h1>
      <p className="lede">サークルメンバー2人の採点データから、好みの共通点とおすすめ作品を探します。</p>

      <div className="card">
        <form method="get">
          <div className="compatibility-selects">
            <div className="field">
              <label htmlFor="user-a">メンバー A</label>
              <select id="user-a" name="a" defaultValue={usernameA} disabled={users.length < 2} required>
                <option value="">選択してください</option>
                {users.map((user) => <option value={user.username} key={user.id}>{userLabel(user)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="user-b">メンバー B</label>
              <select id="user-b" name="b" defaultValue={usernameB} disabled={users.length < 2} required>
                <option value="">選択してください</option>
                {users.map((user) => <option value={user.username} key={user.id}>{userLabel(user)}</option>)}
              </select>
            </div>
          </div>
          <div className="actions">
            <button type="submit" className="primary" disabled={users.length < 2}>比較する</button>
          </div>
        </form>
      </div>

      {!result ? (
        <div className="card"><p className="compatibility-empty">{message}</p></div>
      ) : (
        <>
          <section className="card">
            <div className="results-header">
              <h2>共通で採点した作品</h2>
              <span className="count"><strong>{result.commonCount}</strong> 作品</span>
            </div>
            <p className="compatibility-summary">{userLabel(result.userA)} と {userLabel(result.userB)} の両方が採点した作品数です。</p>
          </section>

          <section className="card">
            <div className="results-header">
              <h2>二人とも高評価な作品</h2>
              <span className="count"><strong>{result.commonFavorites.length}</strong> 作品</span>
            </div>
            <p className="compatibility-summary">二人とも {HIGH_SCORE} 点以上を付けた作品です。</p>
            <WorkList reviews={result.commonFavorites} emptyMessage="共通の高評価作品はまだありません。" />
          </section>

          <section className="card">
            <div className="results-header">
              <h2>Aは高評価・Bはまだ採点していない</h2>
              <span className="count"><strong>{result.recommendationsFromA.length}</strong> 作品</span>
            </div>
            <p className="compatibility-summary">{userLabel(result.userA)} から {userLabel(result.userB)} へのおすすめ候補です。</p>
            <WorkList reviews={result.recommendationsFromA} emptyMessage="AからBへのおすすめ候補はまだありません。" />
          </section>

          <section className="card">
            <div className="results-header">
              <h2>Bは高評価・Aはまだ採点していない</h2>
              <span className="count"><strong>{result.recommendationsFromB.length}</strong> 作品</span>
            </div>
            <p className="compatibility-summary">{userLabel(result.userB)} から {userLabel(result.userA)} へのおすすめ候補です。</p>
            <WorkList reviews={result.recommendationsFromB} emptyMessage="BからAへのおすすめ候補はまだありません。" />
          </section>
        </>
      )}
    </div>
  );
}
