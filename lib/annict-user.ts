import { prisma } from "@/lib/prisma";

const ANNICT_GRAPHQL_URL = "https://api.annict.com/graphql";

const WATCHED_WORKS_QUERY = `
  query($after: String) {
    viewer {
      libraryEntries(states: [WATCHED], first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          work {
            id
            annictId
            title
            image { recommendedImageUrl facebookOgImageUrl }
          }
        }
      }
    }
  }
`;

const WATCHED_WORKS_WITHOUT_IMAGES_QUERY = `
  query($after: String) {
    viewer {
      libraryEntries(states: [WATCHED], first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          work {
            id
            annictId
            title
          }
        }
      }
    }
  }
`;

const WORK_IMAGE_QUERY = `
  query($annictIds: [Int!]) {
    searchWorks(annictIds: $annictIds) {
      nodes {
        image { recommendedImageUrl facebookOgImageUrl }
      }
    }
  }
`;

const LIBRARY_STATUS_COUNTS_QUERY = `
  query {
    viewer {
      wannaWatchCount
      watchingCount
      watchedCount
      onHoldCount
      stopWatchingCount
    }
  }
`;

const WATCHED_SEASONS_QUERY = `
  query($after: String) {
    viewer {
      libraryEntries(states: [WATCHED], first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          work { seasonName seasonYear }
        }
      }
    }
  }
`;

// recommendedImageUrl isn't set for every work; fall back to the
// (near-universally present) OGP image so fewer works end up with no
// cover at all. Both are the work's official-site banner art, so the
// two stay visually consistent when mixed in the same grid.
function pickImageUrl(image?: { recommendedImageUrl: string | null; facebookOgImageUrl: string | null } | null) {
  return image?.recommendedImageUrl || image?.facebookOgImageUrl || null;
}

export interface QueuedWork {
  annictId: number;
  globalId: string;
  title: string;
  imageUrl: string | null;
}

export interface RatingQueue {
  items: QueuedWork[];
  remaining: number;
}

interface LibraryResponse {
  data?: {
    viewer?: {
      libraryEntries: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          work: {
            id: string;
            annictId: number;
            title: string;
            image?: { recommendedImageUrl: string | null; facebookOgImageUrl: string | null } | null;
          };
        }>;
      };
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

async function annictRequest<T>(accessToken: string, query: string, variables: object): Promise<T> {
  const response = await fetch(ANNICT_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Annict request failed (status ${response.status})`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("Annict returned an invalid response");
  }
}

function throwGraphQLErrors(errors?: Array<{ message?: string }>) {
  if (!errors?.length) return;
  const details = errors.map((error) => error.message).filter(Boolean).join(", ");
  throw new Error(`Annict request failed${details ? `: ${details}` : ""}`);
}

export interface LibraryStatusCounts {
  wannaWatchCount: number;
  watchingCount: number;
  watchedCount: number;
  onHoldCount: number;
  stopWatchingCount: number;
}

interface LibraryStatusCountsResponse {
  data?: { viewer?: LibraryStatusCounts | null };
  errors?: Array<{ message?: string }>;
}

export async function fetchLibraryStatusCounts(accessToken: string): Promise<LibraryStatusCounts> {
  const result = await annictRequest<LibraryStatusCountsResponse>(
    accessToken,
    LIBRARY_STATUS_COUNTS_QUERY,
    {},
  );
  throwGraphQLErrors(result.errors);
  if (!result.data?.viewer) throw new Error("Annict response did not include the viewer");
  return result.data.viewer;
}

export interface WatchedSeasonCount {
  seasonYear: number;
  seasonName: string;
  count: number;
}

interface WatchedSeasonsResponse {
  data?: {
    viewer?: {
      libraryEntries: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{ work: { seasonName: string | null; seasonYear: number | null } }>;
      };
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

export async function fetchWatchedSeasonCounts(accessToken: string): Promise<WatchedSeasonCount[]> {
  let after: string | null = null;
  const seenCursors = new Set<string>();
  const counts = new Map<string, WatchedSeasonCount>();

  while (true) {
    const result: WatchedSeasonsResponse = await annictRequest<WatchedSeasonsResponse>(
      accessToken,
      WATCHED_SEASONS_QUERY,
      { after },
    );
    throwGraphQLErrors(result.errors);
    const entries = result.data?.viewer?.libraryEntries;
    if (!entries) throw new Error("Annict library response did not include the viewer");

    for (const { work } of entries.nodes) {
      if (work.seasonYear == null || work.seasonName == null) continue;
      const key = `${work.seasonYear}:${work.seasonName}`;
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { seasonYear: work.seasonYear, seasonName: work.seasonName, count: 1 });
    }

    if (!entries.pageInfo.hasNextPage) break;
    const nextCursor = entries.pageInfo.endCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error("Annict library pagination returned an invalid cursor");
    }
    seenCursors.add(nextCursor);
    after = nextCursor;
  }

  return [...counts.values()].sort((a, b) =>
    b.count - a.count || b.seasonYear - a.seasonYear || a.seasonName.localeCompare(b.seasonName),
  );
}

export async function findUnreviewedWorks(
  userId: string,
  accessToken: string,
  includeImages = true,
): Promise<RatingQueue> {
  const reviews = await prisma.review.findMany({
    where: { userId },
    select: { work: { select: { annictId: true } } },
  });
  const reviewedIds = new Set(reviews.map((review) => review.work.annictId));
  let after: string | null = null;
  const items: QueuedWork[] = [];

  while (true) {
    const result: LibraryResponse = await annictRequest<LibraryResponse>(
      accessToken,
      includeImages ? WATCHED_WORKS_QUERY : WATCHED_WORKS_WITHOUT_IMAGES_QUERY,
      { after },
    );
    throwGraphQLErrors(result.errors);

    const entries = result.data?.viewer?.libraryEntries;
    if (!entries) throw new Error("Annict library response did not include the viewer");

    for (const node of entries.nodes) {
      if (reviewedIds.has(node.work.annictId)) continue;

      items.push({
        annictId: node.work.annictId,
        globalId: node.work.id,
        title: node.work.title,
        imageUrl: pickImageUrl(node.work.image),
      });
    }

    if (!entries.pageInfo.hasNextPage) return { items, remaining: items.length };
    const nextCursor = entries.pageInfo.endCursor;
    if (!nextCursor || nextCursor === after) {
      throw new Error("Annict library pagination returned an invalid cursor");
    }
    after = nextCursor;
  }
}

interface WorkImageResponse {
  data?: {
    searchWorks?: {
      nodes: Array<{
        image?: { recommendedImageUrl: string | null; facebookOgImageUrl: string | null } | null;
      }>;
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

// Looks up a single work's current image directly, instead of walking the
// whole watched library. Used when editing an existing review, since the
// image saved on our own Work row may predate this fallback logic (or be
// stale for any other reason) and we want the edit to pick up the current
// best-known image rather than just resaving whatever's already stored.
export async function fetchWorkImage(accessToken: string, annictId: number): Promise<string | null> {
  const result = await annictRequest<WorkImageResponse>(accessToken, WORK_IMAGE_QUERY, {
    annictIds: [annictId],
  });
  if (result.errors?.length || !result.data?.searchWorks) return null;
  return pickImageUrl(result.data.searchWorks.nodes[0]?.image);
}
