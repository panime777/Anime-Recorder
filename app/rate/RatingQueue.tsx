"use client";

import { useState } from "react";
import type { QueuedWork } from "@/lib/annict-user";
import RateForm from "./RateForm";

export default function RatingQueue({ items }: { items: QueuedWork[] }) {
  const [index, setIndex] = useState(0);
  const work = items[index];

  if (!work) {
    return (
      <div className="card">
        <p className="caught-up">全部採点済みです。おつかれさまでした！</p>
      </div>
    );
  }

  return (
    <>
      <p>残り {items.length - index}件</p>
      <div className="card">
        <h2 className="work-title">{work.title}</h2>
        <RateForm key={work.annictId} work={work} onSaved={() => setIndex((value) => value + 1)} />
      </div>
    </>
  );
}
