"use client";

import { useEffect, useState } from "react";

export default function RatingQueueCount() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/rating-queue/count", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load rating queue count");
        return (await response.json()) as { remaining: number };
      })
      .then((result) => setRemaining(result.remaining))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Failed to load rating queue count", error);
      });

    return () => controller.abort();
  }, []);

  return remaining === null ? null : <p>残り {remaining}件</p>;
}
