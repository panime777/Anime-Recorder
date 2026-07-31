# Anime-Recorder

[Annict](https://annict.com/) の視聴記録(アクティビティ)を、期間・ユーザー名指定で取得し、一覧表示・CSV出力できるWebツールです。

## できること

- Annictユーザー名と期間(開始日〜終了日)を指定して、そのユーザーの視聴アクティビティを取得
- ステータスが `watched`(視聴済み)のアクティビティのみを抽出し、作品タイトルの重複を除いて一覧表示
- 取得結果をCSVファイルとしてダウンロード

## できないこと(現時点)

- Annictへの**書き込み**(視聴記録の自動登録)は未実装。現状は**読み取り専用**(既にAnnictに記録済みのデータを取得・整形するだけ)
- dアニメストア・Amazon Prime Videoなど外部配信サービスとの連携は未実装

## 構成

| ファイル | 役割 |
|---|---|
| [watched_list.html](watched_list.html) | フロントエンド。ユーザー名・期間を入力してデータ取得、テーブル表示・CSV出力を行う |
| [netlify/functions/fetch-activities.js](netlify/functions/fetch-activities.js) | Netlify Functions(サーバーレス関数)。Annict APIをアクセストークン付きで呼び出すプロキシ。トークンをクライアント側に露出させないための中継役 |
| [netlify.toml](netlify.toml) | Netlifyのビルド設定(公開ディレクトリ・Functionsディレクトリの指定) |
| [watched_list.ipynb](watched_list.ipynb) | 同等の処理をPythonで行うプロトタイプ用Jupyter Notebook |
| [package.json](package.json) | 依存パッケージ(`node-fetch`)の定義 |

## 使用技術

- フロントエンド: 素のHTML/CSS/JavaScript
- バックエンド: Netlify Functions(Node.js)
- API: [Annict API v1](https://developer.annict.com/)
- ホスティング: Netlify

## セットアップ

1. Netlifyにデプロイし、環境変数 `ANNICT_TOKEN` にAnnictのアクセストークンを設定する
2. デプロイ後のURLで `watched_list.html` を開き、Annictのユーザー名と期間を入力して「Fetch Data」を実行する

## 今後の展望

- Annict APIへの書き込み(視聴記録の自動登録)対応
- 外部配信サービス(dアニメストア、Amazon Prime Videoなど)の視聴履歴との連携
