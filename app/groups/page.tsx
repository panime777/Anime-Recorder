import Link from "next/link";
import { redirect } from "next/navigation";
import ToolNav from "@/app/components/ToolNav";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_GROUP_NAME_LENGTH = 100;

async function createGroup(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/groups");
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > MAX_GROUP_NAME_LENGTH)
    redirect("/groups?error=invalid-name");

  const group = await prisma.group.create({
    data: { name, members: { create: { userId: session.user.id } } },
  });
  redirect(`/groups/${group.id}`);
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
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
              await signIn("annict", { redirectTo: "/groups" });
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

  const [{ error }, memberships] = await Promise.all([
    searchParams,
    prisma.groupMember.findMany({
      where: { userId: session.user.id },
      include: {
        group: { include: { _count: { select: { members: true } } } },
      },
      orderBy: { joinedAt: "desc" },
    }),
  ]);

  return (
    <div className="page">
      <ToolNav />
      <h1>グループ</h1>
      <p className="lede">参加メンバーだけのランキングを作れます。</p>

      <section className="card">
        <h2>参加中のグループ</h2>
        {memberships.length === 0 ? (
          <p className="ranking-empty">参加中のグループはまだありません。</p>
        ) : (
          <ul className="group-list">
            {memberships.map(({ group }) => (
              <li key={group.id}>
                <Link href={`/groups/${group.id}`}>{group.name}</Link>
                <span>{group._count.members}人</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>グループを作成</h2>
        <form action={createGroup}>
          <div className="field">
            <label htmlFor="group-name">グループ名</label>
            <input
              id="group-name"
              name="name"
              type="text"
              maxLength={MAX_GROUP_NAME_LENGTH}
              required
            />
          </div>
          <button type="submit" className="primary">
            作成する
          </button>
        </form>
        {error === "invalid-name" && (
          <p className="form-message">グループ名を入力してください。</p>
        )}
      </section>
    </div>
  );
}
