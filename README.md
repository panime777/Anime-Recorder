# Anime-Recorder

[Annict](https://annict.com/) の視聴記録を取得・比較し、作品の採点やグループ内ランキングを管理するWebアプリです。Annict側への書き込みは行わず、採点・タグ・コメント・グループはこのアプリのPostgreSQLに保存します。

## できること

- Annict OAuthでログイン
- ユーザー名と期間を指定し、視聴済み作品を一覧表示・CSV出力
- 2人のユーザーと視聴ステータスを指定し、共通する作品を一覧表示・CSV出力
- Annictで視聴済みの未採点作品を0〜10点で採点し、タグ・コメントを保存・編集
- グループ作成、登録ユーザーの追加、Annictのフォロー相手から追加候補を表示
- 全体・グループごとの採点数・平均スコア、クール別の人気作品ランキング

Annict参照・採点APIと採点・グループ・ランキング機能にはログインが必要です。ランキングの「全体」は登録ユーザー全員の集計です。グループメンバーは誰でも登録ユーザーを追加できます。

## セットアップ

Node.js 22.12以上の22系、または24以上と、PostgreSQLを用意してください。

1. `.env` に以下の環境変数を設定します。
2. 依存関係をインストールし、開発用DBにマイグレーションを適用します。

```bash
npm ci
npx prisma migrate deploy
npm run dev
```

開発サーバーは `http://localhost:3000` で起動します。`npm ci`・開発起動・ビルド時にPrisma Clientが生成されます。`prisma migrate deploy` は接続先DBを書き換えるため、開発環境では開発用DBを指定してください。

| 変数 | 用途 |
|---|---|
| `ANNICT_TOKEN` | 視聴済みリスト・共通項チェッカーからAnnict APIを参照するためのトークン |
| `ANNICT_CLIENT_ID` | Annict OAuthクライアントID |
| `ANNICT_CLIENT_SECRET` | Annict OAuthクライアントシークレット |
| `DATABASE_URL` | ユーザー・採点・グループを保存するPostgreSQL接続URL |
| `AUTH_SECRET` | Auth.jsのセッション署名用シークレット |
| `NETLIFY_DB_URL` | Netlify DB利用時の接続URL。設定されている場合は`DATABASE_URL`より優先 |

AnnictのOAuthアプリには `http://localhost:3000/api/auth/callback/annict`（本番では公開URLの同パス）をコールバックURLとして登録します。取得スコープは`read`です。採点キュー・作品情報の確認・フォロー取得にはログインユーザーのOAuthトークンを使います。

## 開発時の検証

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

ESLintはNext.js・TypeScriptのルールを使用します。TypeScriptはlintの対応範囲に合わせた6.0系を使用し、Next.js標準の型チェックでビルドします。Vitestの回帰テストはAnnict APIとDBをモックするため、実データやログインは不要です。新しいチェックアウトでは先に`npm ci`でPrisma Clientを生成してください。

Prisma 7.10の間接依存である`deepmerge-ts`と`mysql2`は、公開済み脆弱性への対応として`package.json`の`overrides`で修正版に固定しています。Prisma更新時には上流の依存定義を確認し、不要になった固定を削除してください。`deepmerge-ts` 8はMapのマージ方法などに変更がありますが、このアプリのPrisma設定は通常のオブジェクトと文字列のみを使用します。

## 保存時の動作

レビューAPIは作品ID・スコア・タグ・コメントを受け取ります。全員で共有する作品名・画像・放送時期は、サーバーからAnnictに問い合わせて取得します。クライアントから同名の項目が送信されても採用しません。作品とレビューは同じトランザクションで保存します。

作品情報の取得に失敗した場合は保存せず、再試行を案内します。このため採点の新規保存・編集にはAnnictへの接続が必要です。

## 構成

| パス | 役割 |
|---|---|
| `app/page.tsx` | トップページ・ログイン導線 |
| `app/tools/` | 視聴済みリストと共通項チェッカー |
| `app/rate/`, `app/reviews/` | 採点キュー・レビュー一覧・編集 |
| `app/groups/`, `app/ranking/` | グループ管理・ランキング |
| `app/api/annict/` | Annict REST / GraphQL APIへのサーバー側プロキシ |
| `app/api/reviews/` | 採点保存API |
| `app/api/auth/` | Auth.jsのAnnict OAuthエンドポイント |
| `lib/` | 認証・DB接続・Annict取得・CSV出力・視聴履歴処理 |
| `prisma/` | PostgreSQLスキーマ・マイグレーション |
| `tests/` | API保存・Annict取得・視聴履歴処理の回帰テスト |
| `netlify.toml` | Netlify向けNext.jsビルド設定 |
| `watched_list.ipynb` | Pythonで同等の処理を試したプロトタイプ |

## 使用技術

- Next.js (App Router) / React / TypeScript
- Auth.js / Prisma / PostgreSQL
- Annict REST API / GraphQL API
- Netlify
