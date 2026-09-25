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
            seasonName
            seasonYear
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
            seasonName
            seasonYear
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

const WORK_QUERY = `
  query($annictIds: [Int!]) {
    searchWorks(annictIds: $annictIds, first: 1) {
      nodes {
        annictId title seasonName seasonYear
        image { recommendedImageUrl facebookOgImageUrl }
      }
    }
  }
`;

interface WorkResponse {
  data?: {
    searchWorks?: {
      nodes: Array<{
        annictId: number;
        title: string;
        seasonName: string | null;
        seasonYear: number | null;
        image: {
          recommendedImageUrl: string | null;
          facebookOgImageUrl: string | null;
        } | null;
      }>;
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

export async function fetchWork(accessToken: string, annictId: number) {
  const result = await annictRequest<WorkResponse>(accessToken, WORK_QUERY, {
    annictIds: [annictId],
  });

  if (result.errors?.length || !result.data?.searchWorks) {
    throw new Error("Annict work request failed");
  }
  const work = result.data.searchWorks.nodes[0];
  if (!work) return null;
  if (
    work.annictId !== annictId ||
    typeof work.title !== "string" ||
    !work.title.trim()
  ) {
    throw new Error("Annict returned an invalid work");
  }
  return {
    annictId: work.annictId,
    title: work.title,
    imageUrl: pickImageUrl(work.image),
    seasonName: work.seasonName,
    seasonYear: work.seasonYear,
  };
}

// recommendedImageUrl isn't set for every work; fall back to the
// (near-universally present) OGP image so fewer works end up with no
// cover at all. Both are the work's official-site banner art, so the
// two stay visually consistent when mixed in the same grid.
function pickImageUrl(
  image?: {
    recommendedImageUrl: string | null;
    facebookOgImageUrl: string | null;
  } | null,
) {
  return image?.recommendedImageUrl || image?.facebookOgImageUrl || null;
}

export interface QueuedWork {
  annictId: number;
  globalId: string;
  title: string;
  imageUrl: string | null;
  seasonName: string | null;
  seasonYear: number | null;
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
            seasonName: string | null;
            seasonYear: number | null;
            image?: {
              recommendedImageUrl: string | null;
              facebookOgImageUrl: string | null;
            } | null;
          };
        }>;
      };
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

async function annictRequest<T>(
  accessToken: string,
  query: string,
  variables: object,
): Promise<T> {
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
    if (result.errors?.length) {
      const details = result.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join(", ");
      throw new Error(
        `Annict library request failed${details ? `: ${details}` : ""}`,
      );
    }

    const entries = result.data?.viewer?.libraryEntries;
    if (!entries)
      throw new Error("Annict library response did not include the viewer");

    for (const node of entries.nodes) {
      if (reviewedIds.has(node.work.annictId)) continue;

      items.push({
        annictId: node.work.annictId,
        globalId: node.work.id,
        title: node.work.title,
        imageUrl: pickImageUrl(node.work.image),
        seasonName: node.work.seasonName,
        seasonYear: node.work.seasonYear,
      });
    }

    if (!entries.pageInfo.hasNextPage)
      return { items, remaining: items.length };
    const nextCursor = entries.pageInfo.endCursor;
    if (!nextCursor || nextCursor === after) {
      throw new Error("Annict library pagination returned an invalid cursor");
    }
    after = nextCursor;
  }
}

interface FollowingResponse {
  data?: {
    viewer?: {
      following: {
        nodes: Array<{ username: string; name: string | null }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

const FOLLOWING_QUERY = `
  query($after: String) {
    viewer {
      following(first: 50, after: $after) {
        nodes { username name }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

export async function fetchFollowing(accessToken: string) {
  const people = new Map<string, { username: string; name: string | null }>();
  const cursors = new Set<string>();
  let after: string | null = null;
  while (true) {
    const result: FollowingResponse = await annictRequest<FollowingResponse>(
      accessToken,
      FOLLOWING_QUERY,
      { after },
    );
    const following = result.data?.viewer?.following;
    if (result.errors?.length || !following || !Array.isArray(following.nodes)) {
      throw new Error("Annict following request failed");
    }
    for (const person of following.nodes) {
      if (
        typeof person?.username === "string" &&
        (typeof person.name === "string" || person.name === null)
      ) {
        people.set(person.username, person);
      }
    }
    if (!following.pageInfo.hasNextPage) return [...people.values()];
    const cursor = following.pageInfo.endCursor;
    if (!cursor || cursors.has(cursor)) {
      throw new Error("Annict following pagination returned an invalid cursor");
    }
    cursors.add(cursor);
    after = cursor;
  }
}

interface WorkImageResponse {
  data?: {
    searchWorks?: {
      nodes: Array<{
        image?: {
          recommendedImageUrl: string | null;
          facebookOgImageUrl: string | null;
        } | null;
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
export async function fetchWorkImage(
  accessToken: string,
  annictId: number,
): Promise<string | null> {
  const result = await annictRequest<WorkImageResponse>(
    accessToken,
    WORK_IMAGE_QUERY,
    {
      annictIds: [annictId],
    },
  );
  if (result.errors?.length || !result.data?.searchWorks) return null;
  return pickImageUrl(result.data.searchWorks.nodes[0]?.image);
}
