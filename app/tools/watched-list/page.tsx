"use client";

import { useState } from "react";
import ToolNav from "@/app/components/ToolNav";
import { createCsv } from "@/lib/csv";
import { collectWatchedWorks, getDateRange, type Activity, type WatchedWork } from "@/lib/watched-list";

const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000, 40000];

interface ActivityData {
  activities: Activity[];
}

// Annict側のレートリミット等、一時的な5xxエラーは間隔を広げながらリトライする。
// 4xx(ユーザー名間違いなど)はリトライしても解決しないので即座に失敗させる。
async function fetchPageWithRetry(
  url: string,
  username: string,
  setProgress: (text: string) => void,
): Promise<ActivityData> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const response = await fetch(url);
    if (response.ok) {
      return (await response.json()) as ActivityData;
    }
    if (response.status < 500) {
      throw new Error(`${username} のデータ取得に失敗しました (status ${response.status})`);
    }
    if (attempt === RETRY_DELAYS_MS.length) {
      throw new Error(
        `${username} のデータ取得に失敗しました (status ${response.status})。Annict側が混雑している可能性があります。しばらく時間をおいて再度お試しください`,
      );
    }
    setProgress(
      `${username}: 一時的なエラーのため ${Math.round(RETRY_DELAYS_MS[attempt] / 1000)}秒待ってリトライします...`,
    );
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
  throw new Error("unreachable");
}

export default function WatchedListPage() {
  const [username, setUsername] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [results, setResults] = useState<WatchedWork[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  async function handleFetch() {
    if (loading) return;
    let page = 1;
    const works = new Map<number, WatchedWork>();
    setResults([]);
    setProgress("");
    setLoading(true);

    try {
      const { start, end } = getDateRange(startDate, endDate);
      const name = username.trim();
      if (!name) throw new Error("ユーザー名を入力してください");
      while (true) {
        setProgress(`${name} のデータを取得中... (${page}ページ目)`);
        const params = new URLSearchParams({ username: name, page: String(page) });
        const data = await fetchPageWithRetry(`/api/annict/activities?${params}`, name, setProgress);
        if (!data.activities || data.activities.length === 0) break;

        const reachedStart = collectWatchedWorks(data.activities, start, end, works);
        setResults([...works.values()]);
        if (reachedStart) break;
        page++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      setProgress("完了しました！");
    } catch (error) {
      setProgress(
        `${page}ページ目で取得を打ち切りました(ここまでの${works.size}件で集計しています)。原因: ${error instanceof Error ? error.message : "データ取得に失敗しました"}`,
      );
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadCsv() {
    const rows = [["Created At", "Work Title"], ...results.map((r) => [r.createdAt, r.title])];
    const csvContent = createCsv(rows);
    const bom = "﻿";
    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "filtered_data.csv";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleClear() {
    setResults([]);
    setProgress("");
    alert("データがクリアされました！");
  }

  return (
    <div className="page">
      <ToolNav />

      <h1>Annict 活動データ取得ツール</h1>
      <p className="lede">ユーザー名と期間を指定して、視聴済み(watched)の作品一覧を取得します。</p>

      <div className="card">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleFetch();
          }}
        >
          <div className="field">
            <label htmlFor="username">
              Username <span className="hint">(@から始まるアルファベットです ※@は除く)</span>
            </label>
            <input
              type="text"
              id="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="start_date">Start Date</label>
            <input
              type="date"
              id="start_date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="end_date">End Date</label>
            <input
              type="date"
              id="end_date"
              required
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>

          <div className="actions">
            <button type="submit" className="primary" disabled={loading}>
              Fetch Data
            </button>
            <button type="button" className="secondary" disabled={loading} onClick={handleDownloadCsv}>
              Download CSV
            </button>
            <button type="button" className="secondary" disabled={loading} onClick={handleClear}>
              Clear Data
            </button>
          </div>
        </form>
      </div>

      {loading && <div id="loading-popup">実行中です...</div>}

      <div className="card">
        <div className="results-header">
          <h2>Results</h2>
          <span className="count">
            Total: <strong>{results.length}</strong>
          </span>
        </div>
        <p className="progress">{progress}</p>
        <table>
          <thead>
            <tr>
              <th>Created At</th>
              <th>Work Title</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row) => (
              <tr key={row.id}>
                <td>{row.createdAt}</td>
                <td>{row.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
