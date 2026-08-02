import ToolNav from "@/app/components/ToolNav";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildRecommendations } from "@/lib/recommendations";

export default async function RecommendationsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="page">
        <ToolNav />
        <h1>おすすめ作品</h1>
        <div className="card">
          <p>このページを使うにはログインが必要です。</p>
          <form action={async () => { "use server"; await signIn("annict", { redirectTo: "/recommendations" }); }}>
            <button type="submit" className="primary">Annictでログイン</button>
          </form>
        </div>
      </div>
    );
  }

  const [ownLikedReviews, candidateWorks] = await Promise.all([
    prisma.review.findMany({
      where: { userId: session.user.id, score: { gte: 7 } },
      select: { tags: true },
    }),
    prisma.work.findMany({
      where: {
        reviews: {
          none: { userId: session.user.id },
          some: { userId: { not: session.user.id }, score: { gte: 7 } },
        },
      },
      select: {
        id: true,
        annictId: true,
        title: true,
        imageUrl: true,
        reviews: {
          where: { userId: { not: session.user.id }, score: { gte: 7 } },
          select: { score: true, tags: true },
        },
      },
    }),
  ]);

  // Only high scores are averaged: these are the same reviews that establish a
  // candidate and explain how many members actively recommended it.
  const recommendations = buildRecommendations(ownLikedReviews, candidateWorks);

  return (
    <div className="page">
      <ToolNav />
      <h1>おすすめ作品</h1>
      <p className="lede">部員の高評価と、あなたが好きなタグをもとに選びました。</p>

      {recommendations.length === 0 ? (
        <div className="card">
          <p className="caught-up">まだおすすめできる作品がありません。みんなの採点が増えたら、また見に来てください。</p>
        </div>
      ) : (
        <div className="review-grid">
          {recommendations.map(({ work, avgScore, raterCount, matchingTags }) => (
            <article className="review-grid-item" key={work.id}>
              <div className="review-cover-frame">
                {work.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="review-cover" src={work.imageUrl} alt={`${work.title}のカバー画像`} loading="lazy" />
                ) : (
                  <div className="review-cover-placeholder" aria-hidden="true">No image</div>
                )}
                <span className="review-score">平均 {avgScore.toFixed(1)}</span>
              </div>
              <h2 className="review-title">{work.title}</h2>
              <p className="recommendation-reason">{raterCount}人の部員が高評価</p>
              {matchingTags.length > 0 && (
                <p className="recommendation-tags">一致するタグ: {matchingTags.join(", ")}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
