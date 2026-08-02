"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { QueuedWork } from "@/lib/annict-user";

interface InitialValues {
  score: number;
  tags: string[];
  comment: string;
}

interface RateFormProps {
  work: Pick<QueuedWork, "annictId" | "title" | "imageUrl" | "seasonName" | "seasonYear">;
  initialValues?: InitialValues;
  redirectTo?: string;
  submitLabel?: string;
  onSaved?: () => void;
}

export default function RateForm({
  work,
  initialValues = { score: 5, tags: [], comment: "" },
  redirectTo,
  submitLabel = "保存して次へ",
  onSaved,
}: RateFormProps) {
  const router = useRouter();
  const [score, setScore] = useState(initialValues.score);
  const [tags, setTags] = useState(initialValues.tags.join(", "));
  const [comment, setComment] = useState(initialValues.comment);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...work,
          score,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          comment,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !result.ok) throw new Error(result.error || "保存に失敗しました");

      setScore(5);
      setTags("");
      setComment("");
      onSaved?.();
      if (redirectTo) router.push(redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="score">スコア（0〜10）</label>
        <input
          id="score"
          type="number"
          min="0"
          max="10"
          step="1"
          required
          value={score}
          onChange={(event) => setScore(Number(event.target.value))}
        />
      </div>
      <div className="field">
        <label htmlFor="tags">タグ <span className="hint">（カンマ区切り）</span></label>
        <input
          id="tags"
          type="text"
          value={tags}
          placeholder="例: 日常, コメディ"
          onChange={(event) => setTags(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="comment">コメント</label>
        <textarea
          id="comment"
          rows={5}
          maxLength={5000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </div>
      <div className="actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? "保存中…" : submitLabel}
        </button>
      </div>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  );
}
