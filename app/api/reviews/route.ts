import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchWork } from "@/lib/annict-user";
import { revalidatePath } from "next/cache";

const MAX_COMMENT_LENGTH = 5_000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return error("ログインが必要です", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("JSON形式のリクエストが必要です");
  }
  if (!body || typeof body !== "object") return error("入力内容が不正です");

  const input = body as Record<string, unknown>;
  const annictId = input.annictId;
  const score = input.score;
  const comment =
    typeof input.comment === "string" ? input.comment.trim() : null;

  if (
    !Number.isInteger(annictId) ||
    (annictId as number) <= 0 ||
    (annictId as number) > 2_147_483_647
  ) {
    return error("annictIdは正の整数で指定してください");
  }
  if (
    !Number.isInteger(score) ||
    (score as number) < 0 ||
    (score as number) > 10
  ) {
    return error("scoreは0〜10の整数で指定してください");
  }
  if (
    input.comment !== undefined &&
    input.comment !== null &&
    typeof input.comment !== "string"
  ) {
    return error("commentは文字列で指定してください");
  }
  if (comment && comment.length > MAX_COMMENT_LENGTH) {
    return error(`commentは${MAX_COMMENT_LENGTH}文字以内で指定してください`);
  }
  if (!Array.isArray(input.tags))
    return error("tagsは文字列の配列で指定してください");
  if (input.tags.some((tag) => typeof tag !== "string")) {
    return error("tagsは文字列の配列で指定してください");
  }

  const tags = [
    ...new Set(input.tags.map((tag) => (tag as string).trim()).filter(Boolean)),
  ];
  if (tags.length > MAX_TAGS)
    return error(`tagsは${MAX_TAGS}件以内で指定してください`);
  if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    return error(`各tagは${MAX_TAG_LENGTH}文字以内で指定してください`);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { accessToken: true },
  });
  if (!user) return error("ユーザー情報が見つかりません", 404);

  // Work is shared by every user's reviews. Only Annict may supply its metadata.
  let metadata;
  try {
    metadata = await fetchWork(user.accessToken, annictId as number);
  } catch {
    return error(
      "Annictから作品情報を取得できませんでした。時間をおいて再度お試しください",
      502,
    );
  }
  if (!metadata) return error("作品が見つかりません", 404);

  await prisma.$transaction(async (tx) => {
    const work = await tx.work.upsert({
      where: { annictId: metadata.annictId },
      update: metadata,
      create: metadata,
    });
    await tx.review.upsert({
      where: { userId_workId: { userId: session.user.id, workId: work.id } },
      update: { score: score as number, tags, comment: comment || null },
      create: {
        userId: session.user.id,
        workId: work.id,
        score: score as number,
        tags,
        comment: comment || null,
      },
    });
  });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
