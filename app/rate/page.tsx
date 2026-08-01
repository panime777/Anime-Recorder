import { findNextUnreviewedWork } from "@/lib/annict-user";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RateForm from "./RateForm";

export default async function RatePage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="page">
        <h1>次に見た作品を採点</h1>
        <div className="card">
          <p>このページを使うにはログインが必要です。</p>
          <form action={async () => { "use server"; await signIn("annict", { redirectTo: "/rate" }); }}>
            <button type="submit" className="primary">Annictでログイン</button>
          </form>
        </div>
      </div>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { accessToken: true },
  });
  if (!user) {
    return <div className="page"><div className="card">ユーザー情報が見つかりません。再ログインしてください。</div></div>;
  }

  let work;
  try {
    work = await findNextUnreviewedWork(session.user.id, user.accessToken);
  } catch (error) {
    console.error("Failed to load rating queue", error);
    return (
      <div className="page">
        <h1>次に見た作品を採点</h1>
        <div className="card">Annictから視聴済み作品を取得できませんでした。時間をおいて再度お試しください。</div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>次に見た作品を採点</h1>
      <p className="lede">Annictで視聴済みの作品を、1作品ずつ採点します。</p>
      <div className="card">
        {work ? (
          <>
            <h2 className="work-title">{work.title}</h2>
            <RateForm work={work} />
          </>
        ) : (
          <p className="caught-up">全部採点済みです。おつかれさまでした！</p>
        )}
      </div>
    </div>
  );
}
