# Modern Web Guidance MCP for Cloudflare Workers

GoogleChrome/modern-web-guidance の Markdown guides を検索・取得できる、Cloudflare Workers 上で動作する MCP サーバーです。アプリと補助スクリプトは TypeScript で記述し、パッケージ管理・スクリプト・テストには Bun を使います。HTTP サーバーの実行環境は Bun ではなく Cloudflare Workers です。

- `search(query, limit?)`: BM25 + Workers AI `qwen3-embedding-0.6b` 意味検索
- `list(offset?, limit?, category?)`: ガイドのメタデータ一覧（ページ分割・カテゴリ絞り込み）
- `retrieve(id)`: ガイドの Markdown 全文を取得
- ガイド・チャンク・ベクトルは TypeScript ソースに同梱。実行時の GitHub 接続や DB は不要
- `POST /mcp` は JSON 応答の stateless Streamable HTTP

## セットアップ

Bun 1.3 以降を使用します。

```bash
bun install
bun run check
bun test
bun run dev
```

`bun run dev` は Wrangler でローカルの Worker を起動します。通常 `http://localhost:8787` でアクセスでき、MCP エンドポイントは `/mcp` です。デプロイは `bun run deploy` です。

## データ同期と意味検索ベクトルの生成

```bash
bun run sync
```

GoogleChrome/modern-web-guidance の現在の `main` からガイドを取得し、`src/generated/*.gen.ts` を生成します。`GITHUB_TOKEN` を指定すると GitHub API のレート制限を緩和できます。同期後は既存ベクトルがクリアされます。

ベクトルは Workers AI で生成します。

```bash
export CLOUDFLARE_ACCOUNT_ID="..."
export CLOUDFLARE_API_TOKEN="..."
bun run embed
```

生成したベクトルは Worker に同梱されます。実行時のクエリ embedding には Wrangler 設定の `AI` binding を使います。ベクトルを生成しない場合は BM25 のみで検索します。

## 公開と認証

公開 Worker では `MCP_TOKEN` を必ず設定してください。トークン未設定の localhost 以外の MCP リクエストは拒否されます。

```bash
bunx wrangler secret put MCP_TOKEN
bun run deploy
```

クライアントから `Authorization: Bearer <token>` を送ります。

```json
{
  "mcpServers": {
    "modern-web-guidance": {
      "type": "streamable-http",
      "url": "https://modern-web-guidance-mcp.<YOUR_SUBDOMAIN>.workers.dev/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

## データ更新

```bash
bun run sync
bun run embed # 意味検索を使う場合
bun run check
bun test
bun run deploy
```

## 制約

- Streamable HTTP は stateless / JSON response です。セッション再開や長時間 GET SSE は扱いません。
- 検索ごとの外部通信は、設定に応じて Workers AI 最大1回です。
- 公開前に `MCP_TOKEN` を設定し、Cloudflare の利用料金に注意してください。

## Upstream attribution

ガイドは [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) の公開 Markdown です。上流ライセンスは Apache-2.0 で、`bun run sync` はライセンスを `UPSTREAM_LICENSE.txt` に保存します。再配布時は上流ライセンスの条項、著作権表示、改変表示等を遵守してください。
