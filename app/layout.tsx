import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anime-Recorder",
  description: "Annictの視聴記録を扱うツール集です。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
