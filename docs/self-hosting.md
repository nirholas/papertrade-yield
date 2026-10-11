---
title: Self-hosting on Cloudflare
description: Run your own copy of Papertrade Yield on Cloudflare Pages with Pages Functions, no database and no secrets.
order: 8
---

# Self-hosting on Cloudflare

The site is static files plus Pages Functions. There is no database, no KV and no secret. You need Node 20 or newer and a Cloudflare account.

## Run locally

```bash
git clone https://github.com/nirholas/papertrade-yield
cd papertrade-yield
npm install
npm run dev:site
```

`dev:site` builds the site and starts `wrangler pages dev` on port 8795 from the `site/` directory.

## Build

```bash
npm run build:site
```

This runs three steps: esbuild bundles `site/app.ts` to `site/public/app.js`, `scripts/build-docs.mjs` renders `docs/*.md` to `site/public/docs/`, and the same script writes the discovery files (server card, agent card, API catalog, `llms.txt`, `llms-full.txt`, `sitemap.xml`).

## Deploy

```bash
cd site
npx wrangler pages deploy --project-name <your-project> --branch main
```

Create the project once with `npx wrangler pages project create <your-project> --production-branch main`. Authenticate with `wrangler login` or a `CLOUDFLARE_API_TOKEN` that has Pages edit permission.

## Configuration

| Item | Where | Default |
| --- | --- | --- |
| `PAPERTRADE_API_URL` | `site/wrangler.toml` `[vars]` | `https://exchange.papertrade.xyz` |
| Public origin | `SITE_URL` in `src/mcp-tools.ts` and the scripts | `https://papertrade-yield.pages.dev` |

If you host under another domain, change the origin where it appears (the build script reads it from `package.json` `homepage`) and rebuild so the cards, sitemap and canonical URLs match.

## Embedding

The app route allows framing by the Papertrade OS host and other `*.pages.dev` pages. `?embed=1` hides the marketing chrome and shows only the product. If you embed it elsewhere, add your origin to `frame-ancestors` in `site/public/_headers`.

## Checks

```bash
npm run typecheck
npm test
npm run build:site
```
