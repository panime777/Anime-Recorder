export const RECOMMENDATION_LIMIT = 18;

type WorkWithHighReviews = {
  id: string;
  annictId: number;
  title: string;
  imageUrl: string | null;
  reviews: Array<{
    score: number;
    tags: string[];
  }>;
};

export type Recommendation = {
  work: Omit<WorkWithHighReviews, "reviews">;
  avgScore: number;
  raterCount: number;
  matchingTags: string[];
  rankingScore: number;
};

export function buildRecommendations(
  ownLikedReviews: Array<{ tags: string[] }>,
  candidateWorks: WorkWithHighReviews[],
): Recommendation[] {
  const likedTagCounts = new Map<string, number>();
  for (const review of ownLikedReviews) {
    for (const tag of review.tags) {
      const normalizedTag = tag.trim();
      if (normalizedTag) {
        likedTagCounts.set(normalizedTag, (likedTagCounts.get(normalizedTag) ?? 0) + 1);
      }
    }
  }

  const rankWork = ({ reviews, ...work }: WorkWithHighReviews): Recommendation => {
    const otherTags = new Set(reviews.flatMap((review) => review.tags.map((tag) => tag.trim())));
    const matchingTags = [...likedTagCounts.keys()]
      .filter((tag) => otherTags.has(tag))
      .sort((a, b) => (likedTagCounts.get(b) ?? 0) - (likedTagCounts.get(a) ?? 0) || a.localeCompare(b, "ja"));
    const avgScore = reviews.reduce((sum, review) => sum + review.score, 0) / reviews.length;

    // A one-off matching tag adds 0.5, while tags repeatedly used on favorites add
    // up to 1.0. This makes personal taste matter without letting one tag outweigh
    // the two-point difference between a 7 and a 9 from fellow club members.
    const tagBonus = matchingTags.reduce((bonus, tag) => {
      const frequency = likedTagCounts.get(tag) ?? 1;
      return bonus + 0.5 + Math.min(frequency - 1, 2) * 0.25;
    }, 0);

    return {
      work,
      avgScore,
      raterCount: reviews.length,
      matchingTags,
      rankingScore: avgScore + tagBonus,
    };
  };

  return candidateWorks
    .map(rankWork)
    .sort(
      (a, b) =>
        b.rankingScore - a.rankingScore ||
        b.avgScore - a.avgScore ||
        b.raterCount - a.raterCount ||
        a.work.title.localeCompare(b.work.title, "ja") ||
        a.work.id.localeCompare(b.work.id),
    )
    .slice(0, RECOMMENDATION_LIMIT);
}
