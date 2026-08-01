import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const username = searchParams.get("username") ?? "";
  const page = searchParams.get("page") ?? "1";
  const accessToken = process.env.ANNICT_TOKEN;

  if (!accessToken) {
    return NextResponse.json({ error: "ANNICT_TOKEN is required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    access_token: accessToken,
    filter_username: username,
    sort_id: "desc",
    fields: "action,created_at,work.id,work.title,status.kind",
    per_page: "50",
    page,
  });

  try {
    const response = await fetch(`https://api.annict.com/v1/activities?${params}`);
    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch data" }, { status: response.status });
    }
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
