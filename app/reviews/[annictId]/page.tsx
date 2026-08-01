import { notFound } from "next/navigation";
import ToolNav from "@/app/components/ToolNav";
import RateForm from "@/app/rate/RateForm";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchWorkImage } from "@/lib/annict-user";

export default async function EditReviewPage({
  params,
}: {
  params: Promise<{ annictId: string }>;
}) {
  const { annictId: annictIdParam } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="page">
        <ToolNav />
        <h1>採点を編集</h1>
        <div className="card">
          <p>このページを使うにはログインが必要です。</p>
          <form action={async () => { "use server"; await signIn("annict", { redirectTo: `/reviews/${annictIdParam}` }); }}>
            <button type="submit" className="primary">Annictでログイン</button>
          </form>
        </div>
      </div>
    );
  }

  const annictId = Number(annictIdParam);
  if (!Number.isInteger(annictId) || annictId <= 0) notFound();

  const [review, user] = await Promise.all([
    prisma.review.findFirst({
      where: { userId: session.user.id, work: { annictId } },
      include: { work: true },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { accessToken: true } }),
  ]);
  if (!review) notFound();

  // Our stored Work.imageUrl may predate the image-fallback logic (or just
  // be stale), so refresh it from Annict for display/re-saving here rather
  // than trusting whatever's already in the DB. If Annict is unreachable,
  // fall back to what we already have instead of failing the whole page.
  const imageUrl = user ? await fetchWorkImage(user.accessToken, annictId).catch(() => null) : null;

  return (
    <div className="page">
      <ToolNav />
      <h1>採点を編集</h1>
      <p className="lede">{review.work.title}</p>
      <div className="card">
        <RateForm
          work={{ ...review.work, imageUrl: imageUrl ?? review.work.imageUrl }}
          initialValues={{
            score: review.score,
            tags: review.tags,
            comment: review.comment ?? "",
          }}
          redirectTo="/reviews"
          submitLabel="変更を保存"
        />
      </div>
    </div>
  );
}
