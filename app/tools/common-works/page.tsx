"use client";

import { useState } from "react";
import ToolNav from "@/app/components/ToolNav";
import { createCsv } from "@/lib/csv";

const STATUS_LABELS = {
  WANNA_WATCH: "見たい",
  WATCHING: "見ている",
  WATCHED: "見た",
  ON_HOLD: "一時中断",
  STOP_WATCHING: "視聴中止",
} as const;

type Status = keyof typeof STATUS_LABELS;

const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000, 40000];
const MAX_PAGES = 500;

interface LibraryEntriesData {
  nodes: Array<{ work: { annictId: number; title: string } }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

interface WorksResult {
  works: Map<number, string>;
  partial: boolean;
}

async function fetchLibraryPageWithRetry(
  username: string,
  state: Status,
  after: string | null,
  setProgress: (text: string) => void,
): Promise<LibraryEntriesData> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const params = new URLSearchParams({ username, states: state });
    if (after) params.set("after", after);

    const response = await fetch(`/api/annict/library-entries?${params}`);
    if (response.ok) return (await response.json()) as LibraryEntriesData;
    if (response.status < 500) {
      throw new Error(
        `${username} のデータ取得に失敗しました (status ${response.status})。ユーザー名が正しいか確認してください`,
      );
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

async function fetchWorksByStatus(
  username: string,
  state: Status,
  setProgress: (text: string) => void,
): Promise<WorksResult> {
  const works = new Map<number, string>();
  let after: string | null = null;
  let page = 0;
  const label = STATUS_LABELS[state];

  while (true) {
    page++;
    setProgress(`${username}(${label}): ${page}ページ目を取得中... (${works.size}件)`);
    let data: LibraryEntriesData;
    try {
      data = await fetchLibraryPageWithRetry(username, state, after, setProgress);
    } catch (error) {
      setProgress(
        `${username}(${label}): ${page}ページ目で取得を打ち切りました(${works.size}件のデータで集計します)。原因: ${(error as Error).message}`,
      );
      return { works, partial: true };
    }

    for (const node of data.nodes) works.set(node.work.annictId, node.work.title);
    if (!data.pageInfo.hasNextPage) break;
    const nextCursor = data.pageInfo.endCursor;
    if (!nextCursor || nextCursor === after || page >= MAX_PAGES) {
      setProgress(
        `${username}(${label}): ページ情報が不正なため取得を打ち切りました(${works.size}件のデータで集計します)`,
      );
      return { works, partial: true };
    }
    after = nextCursor;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  setProgress(`${username}(${label}): 完了(${works.size}件)`);
  return { works, partial: false };
}

export default function CommonWorksPage() {
  const [username1, setUsername1] = useState("");
  const [username2, setUsername2] = useState("");
  const [status1, setStatus1] = useState<Status>("WATCHED");
  const [status2, setStatus2] = useState<Status>("WATCHED");
  const [results, setResults] = useState<string[]>([]);
  const [progress1, setProgress1] = useState("");
  const [progress2, setProgress2] = useState("");
  const [loading, setLoading] = useState(false);
  const [partial, setPartial] = useState(false);

  async function handleFetch() {
    setResults([]);
    setProgress1("");
    setProgress2("");
    setPartial(false);
    setLoading(true);
    try {
      const [result1, result2] = await Promise.all([
        fetchWorksByStatus(username1, status1, setProgress1),
        fetchWorksByStatus(username2, status2, setProgress2),
      ]);
      const commonTitles = [...result1.works]
        .filter(([workId]) => result2.works.has(workId))
        .map(([, title]) => title)
        .sort((a, b) => a.localeCompare(b, "ja"));
      setResults(commonTitles);
      setPartial(result1.partial || result2.partial);
    } catch (error) {
      console.error("Error fetching data:", error);
      alert((error as Error).message || "データ取得中にエラーが発生しました");
      setProgress1("");
      setProgress2("");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadCsv() {
    const rows = [["Work Title"], ...results.map((title) => [title])];
    const blob = new Blob(["﻿" + createCsv(rows)], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "common_works.csv";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleClear() {
    setResults([]);
    setProgress1("");
    setProgress2("");
    setPartial(false);
    alert("データがクリアされました！");
  }

  return (
    <div className="page">
      <ToolNav />
      <h1>視聴ステータス 共通項チェッカー</h1>
      <p className="lede">
        2人のユーザー名と、それぞれの視聴ステータスを指定して、両方の条件に一致する作品を一覧表示します。(例:
        自分が「見た」、相手が「見たい」の作品 = おすすめできる作品)
      </p>

      <div className="card">
        <form onSubmit={(event) => { event.preventDefault(); void handleFetch(); }}>
          <div className="field">
            <label htmlFor="username1">Username 1 <span className="hint">(@から始まるアルファベットです ※@は除く)</span></label>
            <input id="username1" required value={username1} onChange={(event) => setUsername1(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="status1">Username 1 のステータス</label>
            <select id="status1" value={status1} onChange={(event) => setStatus1(event.target.value as Status)}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="username2">Username 2</label>
            <input id="username2" required value={username2} onChange={(event) => setUsername2(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="status2">Username 2 のステータス</label>
            <select id="status2" value={status2} onChange={(event) => setStatus2(event.target.value as Status)}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="actions">
            <button type="submit" className="primary">Compare</button>
            <button type="button" className="secondary" onClick={handleDownloadCsv}>Download CSV</button>
            <button type="button" className="secondary" onClick={handleClear}>Clear Data</button>
          </div>
        </form>
      </div>

      {loading && <div id="loading-popup">実行中です...</div>}

      <div className="card">
        <div className="results-header">
          <h2>Results</h2>
          <span className="count">Common: <strong>{results.length}</strong></span>
        </div>
        {partial && (
          <p className="progress" role="alert">
            警告: 一部のデータを取得できなかったため、比較結果が不完全な可能性があります。
          </p>
        )}
        <p className="progress">{progress1}</p>
        <p className="progress">{progress2}</p>
        <table>
          <thead><tr><th>Work Title</th></tr></thead>
          <tbody>{results.map((title, index) => <tr key={`${title}-${index}`}><td>{title}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
