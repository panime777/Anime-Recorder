import { auth, signIn, signOut } from "@/lib/auth";
import RatingQueueCount from "@/app/components/RatingQueueCount";

export default async function Home() {
  const session = await auth();

  return (
    <div className="page">
      <h1>Anime-Recorder</h1>
      <p className="lede">Annictの視聴記録を扱うツール集です。</p>

      <div className="card">
        {session?.user ? (
          <div className="auth-status">
            <p>{session.user.name} としてログイン中</p>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button type="submit" className="secondary">
                ログアウト
              </button>
            </form>
          </div>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("annict");
            }}
          >
            <button type="submit" className="primary">
              Annictでログイン
            </button>
          </form>
        )}
      </div>

      <div className="card">
        <ul className="tool-list">
          <li>
            <a href="/rate">見た作品を採点</a>
            {session?.user?.id && <RatingQueueCount />}
            <p>Annictで視聴済みの未採点作品を、1作品ずつ採点します。</p>
          </li>
          <li>
            <a href="/reviews">採点した作品</a>
            <p>これまでに採点した作品と、スコア・タグ・コメントを確認します。</p>
          </li>
          <li>
            <a href="/stats">視聴統計</a>
            <p>ライブラリの状態、よく見たクール、採点時のタグをグラフで振り返ります。</p>
          </li>
          <li>
            <a href="/tools/watched-list">視聴済み作品リスト取得</a>
            <p>ユーザー名と期間を指定して、視聴済み作品の一覧をCSVで書き出します。</p>
          </li>
          <li>
            <a href="/tools/common-works">2人の視聴済み作品 共通項チェッカー</a>
            <p>2人のユーザー名を指定して、お互いが視聴済みの作品を一覧表示します。</p>
          </li>
        </ul>
      </div>
    </div>
  );
}
