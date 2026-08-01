import { NextRequest, NextResponse } from "next/server";

const VALID_STATES = ["WANNA_WATCH", "WATCHING", "WATCHED", "ON_HOLD", "STOP_WATCHING"];
const QUERY = `
  query($username: String!, $states: [StatusState!], $after: String) {
    user(username: $username) {
      libraryEntries(states: $states, first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { work { annictId title } }
      }
    }
  }
`;

interface AnnictGraphqlResult {
  data?: { user: { libraryEntries: unknown } | null };
  errors?: unknown;
}

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  const states = request.nextUrl.searchParams.get("states");
  const after = request.nextUrl.searchParams.get("after");
  const accessToken = process.env.ANNICT_TOKEN;

  if (!accessToken) return NextResponse.json({ error: "ANNICT_TOKEN is required" }, { status: 400 });
  if (!username) return NextResponse.json({ error: "username is required" }, { status: 400 });

  const stateList = states ? states.split(",") : [];
  if (stateList.some((state) => !VALID_STATES.includes(state))) {
    return NextResponse.json(
      { error: `states must be one of ${VALID_STATES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const response = await fetch("https://api.annict.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `bearer ${accessToken}` },
      body: JSON.stringify({
        query: QUERY,
        variables: { username, states: stateList.length ? stateList : null, after: after || null },
      }),
    });
    const result = (await response.json()) as AnnictGraphqlResult;
    if (!response.ok || result.errors) {
      return NextResponse.json(
        { error: "Failed to fetch data", details: result.errors },
        { status: response.ok ? 502 : response.status },
      );
    }
    const libraryEntries = result.data?.user?.libraryEntries ?? {
      nodes: [],
      pageInfo: { hasNextPage: false },
    };
    return NextResponse.json(libraryEntries);
  } catch {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
