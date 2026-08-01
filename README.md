# Anime-Recorder

[Annict](https://annict.com/) の視聴記録を取得・比較し、一覧表示やCSV出力ができる読み取り専用のWebツールです。Next.jsへの移行を進めています。

## できること

- ユーザー名と期間を指定し、視聴済み作品を一覧表示・CSV出力
- 2人のユーザーと視聴ステータスを指定し、共通する作品を一覧表示・CSV出力
- Annict OAuthでログイン（現時点ではログイン後の機能はほぼありません）

Annictへの視聴記録の書き込み、独自レビュー、嗜好分析、ソーシャル機能はまだ実装していません。

## セットアップ

```bash
npm install
npm run dev
```

開発サーバーは `http://localhost:3000` で起動します。

環境変数は用途に応じて `.env` に設定します。

| 変数 | 用途 |
|---|---|
| `ANNICT_TOKEN` | 視聴済みリスト・共通項チェッカーからAnnict APIを参照するためのトークン |
| `ANNICT_CLIENT_ID` | Annict OAuthクライアントID |
| `ANNICT_CLIENT_SECRET` | Annict OAuthクライアントシークレット |
| `DATABASE_URL` | OAuthユーザーを保存するPostgreSQL接続URL |
| `AUTH_SECRET` | Auth.jsのセッション署名用シークレット |

OAuthログインには後半4つが必要です。DBを利用した独自レビュー機能はまだありません。

## 構成

| パス | 役割 |
|---|---|
| `app/page.tsx` | トップページ・ログイン導線 |
| `app/tools/` | 視聴済みリストと共通項チェッカー |
| `app/api/annict/` | Annict REST / GraphQL APIへのサーバー側プロキシ |
| `app/api/auth/` | Auth.jsのAnnict OAuthエンドポイント |
| `lib/` | Auth.js・Prismaの設定 |
| `prisma/` | PostgreSQLのスキーマ |
| `netlify.toml` | Netlify向けNext.jsビルド設定 |
| `watched_list.ipynb` | Pythonで同等の処理を試したプロトタイプ |

## 使用技術

- Next.js (App Router) / React / TypeScript
- Auth.js / Prisma / PostgreSQL
- Annict REST API / GraphQL API
- Netlify
