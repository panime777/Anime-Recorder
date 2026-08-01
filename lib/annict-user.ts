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
            image { recommendedImageUrl }
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

export interface QueuedWork {
  annictId: number;
  globalId: string;
  title: string;
  imageUrl: string | null;
}

export interface RatingQueue {
  next: QueuedWork | null;
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
            image?: { recommendedImageUrl: string | null } | null;
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

export async function findNextUnreviewedWork(
  userId: string,
  accessToken: string,
  includeNextImage = true,
): Promise<RatingQueue> {
  const reviews = await prisma.review.findMany({
    where: { userId },
    select: { work: { select: { annictId: true } } },
  });
  const reviewedIds = new Set(reviews.map((review) => review.work.annictId));
  let after: string | null = null;
  let next: QueuedWork | null = null;
  let remaining = 0;

  while (true) {
    const result: LibraryResponse = await annictRequest<LibraryResponse>(
      accessToken,
      includeNextImage ? WATCHED_WORKS_QUERY : WATCHED_WORKS_WITHOUT_IMAGES_QUERY,
      { after },
    );
    if (result.errors?.length) {
      const details = result.errors.map((error) => error.message).filter(Boolean).join(", ");
      throw new Error(`Annict library request failed${details ? `: ${details}` : ""}`);
    }

    const entries = result.data?.viewer?.libraryEntries;
    if (!entries) throw new Error("Annict library response did not include the viewer");

    for (const node of entries.nodes) {
      if (reviewedIds.has(node.work.annictId)) continue;

      remaining += 1;
      next ??= {
        annictId: node.work.annictId,
        globalId: node.work.id,
        title: node.work.title,
        imageUrl: node.work.image?.recommendedImageUrl ?? null,
      };
    }

    if (!entries.pageInfo.hasNextPage) return { next, remaining };
    const nextCursor = entries.pageInfo.endCursor;
    if (!nextCursor || nextCursor === after) {
      throw new Error("Annict library pagination returned an invalid cursor");
    }
    after = nextCursor;
  }
}
