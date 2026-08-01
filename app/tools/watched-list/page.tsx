"use client";

import { useState } from "react";
import ToolNav from "@/app/components/ToolNav";
import { createCsv } from "@/lib/csv";

const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000, 40000];

interface ActivityData {
  activities: Array<{
    action: string;
    created_at: string;
    work: { title: string };
    status: { kind: string };
  }>;
}

interface ResultRow {
  createdAt: string;
  title: string;
}

function parseLocalDate(value: string, endOfDay = false): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
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
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  async function handleFetch() {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate, true);

    let page = 1;
    let flag = false;
    const uniqueTitles = new Set<string>();
    const rows: ResultRow[] = [];

    setResults([]);
    setProgress("");
    setLoading(true);

    while (!flag) {
      setProgress(`${username} のデータを取得中... (${page}ページ目)`);
      const url = `/api/annict/activities?username=${username}&start_date=${start.toISOString()}&end_date=${end.toISOString()}&page=${page}`;

      try {
        const data = await fetchPageWithRetry(url, username, setProgress);

        if (!data.activities || data.activities.length === 0) {
          break;
        }

        for (const activity of data.activities) {
          if (activity.action === "create_status" && activity.status.kind === "watched") {
            const createdAt = new Date(activity.created_at);
            if (createdAt >= start && createdAt <= end) {
              if (!uniqueTitles.has(activity.work.title)) {
                uniqueTitles.add(activity.work.title);
                rows.push({ createdAt: activity.created_at, title: activity.work.title });
              }
            } else if (createdAt < start) {
              flag = true;
              break;
            }
          }
        }

        setResults([...rows]);

        if (flag) {
          break;
        }

        page++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        setProgress(
          `${page}ページ目で取得を打ち切りました(ここまでの${rows.length}件で集計しています)。原因: ${(error as Error).message}`,
        );
        setLoading(false);
        return;
      }
    }

    setProgress("");
    setLoading(false);
    alert("完了しました！");
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
            <button type="submit" className="primary">
              Fetch Data
            </button>
            <button type="button" className="secondary" onClick={handleDownloadCsv}>
              Download CSV
            </button>
            <button type="button" className="secondary" onClick={handleClear}>
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
            {results.map((row, index) => (
              <tr key={index}>
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
