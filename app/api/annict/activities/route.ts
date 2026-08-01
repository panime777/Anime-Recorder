import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const MAX_PAGE = 500;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const username = searchParams.get("username")?.trim() ?? "";
  const pageParam = searchParams.get("page") ?? "1";
  const page = Number(pageParam);
  const accessToken = process.env.ANNICT_TOKEN;

  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    return NextResponse.json(
      { error: `page must be an integer between 1 and ${MAX_PAGE}` },
      { status: 400 },
    );
  }
  if (!accessToken) {
    return NextResponse.json({ error: "ANNICT_TOKEN is required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    filter_username: username,
    sort_id: "desc",
    fields: "action,created_at,work.id,work.title,status.kind",
    per_page: "50",
    page: String(page),
  });

  try {
    const response = await fetch(`https://api.annict.com/v1/activities?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch data" }, { status: response.status });
    }
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
