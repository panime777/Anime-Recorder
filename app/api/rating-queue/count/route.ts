import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findUnreviewedWorks } from "@/lib/annict-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { accessToken: true },
  });
  if (!user) {
    return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 404 });
  }

  try {
    const queue = await findUnreviewedWorks(session.user.id, user.accessToken, false);
    return NextResponse.json({ remaining: queue.remaining });
  } catch (error) {
    console.error("Failed to load rating queue count", error);
    return NextResponse.json({ error: "残り件数を取得できませんでした" }, { status: 502 });
  }
}
