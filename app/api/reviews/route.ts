import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_TITLE_LENGTH = 500;
const MAX_COMMENT_LENGTH = 5_000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;
const MAX_IMAGE_URL_LENGTH = 2_000;
const MAX_SEASON_NAME_LENGTH = 50;

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
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const score = input.score;
  const comment =
    typeof input.comment === "string" ? input.comment.trim() : null;
  const imageUrl =
    typeof input.imageUrl === "string" ? input.imageUrl.trim() : null;
  const seasonName =
    typeof input.seasonName === "string" ? input.seasonName.trim() : null;
  const seasonYear = input.seasonYear ?? null;

  if (!Number.isInteger(annictId) || (annictId as number) <= 0) {
    return error("annictIdは正の整数で指定してください");
  }
  if (!title || title.length > MAX_TITLE_LENGTH) {
    return error(`titleは1〜${MAX_TITLE_LENGTH}文字で指定してください`);
  }
  if (
    !Number.isInteger(score) ||
    (score as number) < 0 ||
    (score as number) > 10
  ) {
    return error("scoreは0〜10の整数で指定してください");
  }
  if (
    input.imageUrl !== undefined &&
    input.imageUrl !== null &&
    typeof input.imageUrl !== "string"
  ) {
    return error("imageUrlは文字列で指定してください");
  }
  if (imageUrl && imageUrl.length > MAX_IMAGE_URL_LENGTH) {
    return error(`imageUrlは${MAX_IMAGE_URL_LENGTH}文字以内で指定してください`);
  }
  if (
    input.seasonName !== undefined &&
    input.seasonName !== null &&
    typeof input.seasonName !== "string"
  ) {
    return error("seasonNameは文字列で指定してください");
  }
  if (seasonName && seasonName.length > MAX_SEASON_NAME_LENGTH) {
    return error(
      `seasonNameは${MAX_SEASON_NAME_LENGTH}文字以内で指定してください`,
    );
  }
  if (
    seasonYear !== null &&
    (!Number.isInteger(seasonYear) ||
      (seasonYear as number) < 1900 ||
      (seasonYear as number) > 3000)
  ) {
    return error("seasonYearは1900〜3000の整数で指定してください");
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

  const work = await prisma.work.upsert({
    where: { annictId: annictId as number },
    update: {
      title,
      imageUrl: imageUrl ?? null,
      // Do not erase season data learned from Annict when an older or
      // hand-crafted client omits it from a later review edit.
      ...(seasonName ? { seasonName } : {}),
      ...(seasonYear !== null ? { seasonYear: seasonYear as number } : {}),
    },
    create: {
      annictId: annictId as number,
      title,
      imageUrl: imageUrl ?? null,
      seasonName: seasonName || null,
      seasonYear: seasonYear as number | null,
    },
  });
  await prisma.review.upsert({
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

  return NextResponse.json({ ok: true });
}
