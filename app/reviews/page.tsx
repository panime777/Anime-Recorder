import ToolNav from "@/app/components/ToolNav";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ReviewsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="page">
        <ToolNav />
        <h1>採点した作品</h1>
        <div className="card">
          <p>このページを使うにはログインが必要です。</p>
          <form action={async () => { "use server"; await signIn("annict", { redirectTo: "/reviews" }); }}>
            <button type="submit" className="primary">Annictでログイン</button>
          </form>
        </div>
      </div>
    );
  }

  const reviews = await prisma.review.findMany({
    where: { userId: session.user.id },
    include: { work: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="page">
      <ToolNav />
      <h1>採点した作品</h1>
      <p className="lede">これまでに採点した作品の一覧です。</p>

      {reviews.length === 0 ? (
        <div className="card">
          <p className="caught-up">まだ採点した作品がありません。</p>
        </div>
      ) : (
        <div className="review-list">
          {reviews.map((review) => (
            <article className="card review-card" key={review.id}>
              <div>
                {review.work.imageUrl ? (
                  // Annict supplies the image URL; a regular img avoids restricting its CDN host.
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
              </div>
              <div>
                <h2 className="review-title">{review.work.title}</h2>
                <p className="review-score">{review.score} / 10</p>
                {review.tags.length > 0 && (
                  <div className="review-tags" aria-label="タグ">
                    {review.tags.map((tag) => <span className="review-tag" key={tag}>{tag}</span>)}
                  </div>
                )}
                {review.comment && <p className="review-comment">{review.comment}</p>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
