import { notFound, redirect } from "next/navigation";
import ToolNav from "@/app/components/ToolNav";
import { auth, signIn } from "@/lib/auth";
import { fetchFollowing } from "@/lib/annict-user";
import { prisma } from "@/lib/prisma";

async function addMember(groupId: string, formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect(`/groups/${groupId}`);
  const userId = String(formData.get("userId") ?? "");
  const username = String(formData.get("username") ?? "")
    .trim()
    .replace(/^@/, "");
  const [membership, user] = await Promise.all([
    prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: session.user.id } },
    }),
    userId
      ? prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
      : username
        ? prisma.user.findUnique({ where: { username }, select: { id: true } })
        : null,
  ]);
  if (!membership) redirect("/groups");
  if (user) {
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId, userId: user.id } },
      update: {},
      create: { groupId, userId: user.id },
    });
  }
  redirect(`/groups/${groupId}`);
}

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, auth()]);
  if (!session?.user?.id) {
    return (
      <div className="page">
        <ToolNav />
        <h1>グループ</h1>
        <div className="card">
          <p>このページを使うにはログインが必要です。</p>
          <form
            action={async () => {
              "use server";
              await signIn("annict", { redirectTo: `/groups/${id}` });
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

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      members: { include: { user: true }, orderBy: { joinedAt: "asc" } },
    },
  });
  if (!group) notFound();
  if (!group.members.some((member) => member.userId === session.user.id))
    redirect("/groups");

  const memberIds = group.members.map((member) => member.userId);
  const [candidates, currentUser] = await Promise.all([
    prisma.user.findMany({
      where: { id: { notIn: memberIds } },
      select: { id: true, username: true, name: true },
      orderBy: { username: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { accessToken: true },
    }),
  ]);
  const following = currentUser
    ? await fetchFollowing(currentUser.accessToken).catch(() => [])
    : [];
  const followingNames = new Set(following.map((person) => person.username));
  const suggestions = candidates.filter((candidate) =>
    followingNames.has(candidate.username),
  );
  const action = addMember.bind(null, id);

  return (
    <div className="page">
      <ToolNav />
      <h1>{group.name}</h1>
      <p className="lede">メンバーは誰でも新しいメンバーを追加できます。</p>

      <section className="card">
        <h2>メンバー（{group.members.length}人）</h2>
        <ul className="member-list">
          {group.members.map(({ user }) => (
            <li key={user.id}>
              {user.name || `@${user.username}`} <span>@{user.username}</span>
            </li>
          ))}
        </ul>
      </section>

      {suggestions.length > 0 && (
        <section className="card">
          <h2>Annictでフォロー中</h2>
          <p className="ranking-note">
            このアプリに登録済みのフォロー相手です。
          </p>
          <div className="suggestion-list">
            {suggestions.map((user) => (
              <form action={action} key={user.id}>
                <input type="hidden" name="userId" value={user.id} />
                <span>{user.name || `@${user.username}`}</span>
                <button type="submit" className="secondary">
                  追加
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>登録ユーザーから追加</h2>
        {candidates.length === 0 ? (
          <p className="ranking-empty">追加できる登録ユーザーはいません。</p>
        ) : (
          <form action={action}>
            <div className="field">
              <label htmlFor="member-user">ユーザー名で検索・選択</label>
              <input
                id="member-user"
                name="username"
                type="text"
                list="registered-users"
                placeholder="ユーザー名を入力"
                required
              />
              <datalist id="registered-users">
                {candidates.map((user) => (
                  <option key={user.id} value={user.username} />
                ))}
              </datalist>
            </div>
            <button type="submit" className="primary">
              メンバーに追加
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
