"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { QueuedWork } from "@/lib/annict-user";

export default function RateForm({ work }: { work: QueuedWork }) {
  const router = useRouter();
  const [score, setScore] = useState(5);
  const [tags, setTags] = useState("");
  const [comment, setComment] = useState("");
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
        annictSynced?: boolean;
        error?: string;
      };
      if (!response.ok || !result.ok) throw new Error(result.error || "保存に失敗しました");

      if (result.annictSynced === false) {
        setMessage("採点は保存しましたが、Annictへの同期に失敗しました。再ログインが必要な場合があります。");
        setTimeout(() => router.refresh(), 1800);
      } else {
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました");
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
          {submitting ? "保存中…" : "保存して次へ"}
        </button>
      </div>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  );
}
