---
title: Security and limits
description: What this project can and cannot do with money, how untrusted data is handled, rate limits, caching and headers.
order: 9
---

# Security and limits

## Money safety

- No endpoint, tool or script here signs, sends, swaps, bridges, mints or pays.
- `plan_staking_action` returns an unsigned plan. Its output says `unsigned: true`, `signed: false` and `submitted: false`.
- In the web app, the user's own browser wallet signs an EIP-712 intent after a confirmation dialog. The Papertrade relayer submits it. No private key ever reaches this site.
- Do not paste a seed phrase or private key into any AI client. No part of this project asks for one.

## Untrusted data

Strings that come from the chain or from the Papertrade API are data, never instructions. The MCP tools return them as values, the web app escapes them before rendering, and an AI client should treat them the same way.

## Limits

| Limit | Value |
| --- | --- |
| MCP `tools/call` rate | 60 per minute per client IP, then `429` with `Retry-After`. |
| MCP request body | 64 KB, then `413`. |
| JSON-RPC batch size | 20. |
| Claims window | 1 to 72 hours. |
| Yield history | 1 to 720 hours. |
| Wallet history | Up to 8 pages of 75 events, then `historyComplete: false`. |
| Live wallet stream | One per page. The upstream stream is rate limited (HTTP 429). |

The limiter is in memory per Cloudflare isolate, so it is a courtesy guard against loops, not a hard quota. Upstream calls per tool call are bounded.

## Caching

`/api/staking` is cached 60 seconds, `/api/staking/claims` 5 minutes, `/api/staking/wallet` 15 seconds per address. MCP responses are not cached. Treat any figure as a recent read, not a quote.

## Headers

The app sends a strict Content-Security-Policy (`script-src 'self'`, `connect-src 'self'`, no inline scripts), `X-Content-Type-Options: nosniff`, a restrictive `Referrer-Policy` and `Permissions-Policy`. `frame-ancestors` allows only the site itself, `https://papertrade-os.pages.dev` and `https://*.pages.dev`. Discovery files and the MCP endpoint send `access-control-allow-origin: *` because they are public and unauthenticated. Origin is never trusted for auth, and there are no cookies.

## Reporting a vulnerability

Use the private advisory form: [github.com/nirholas/papertrade-yield/security/advisories/new](https://github.com/nirholas/papertrade-yield/security/advisories/new). See `SECURITY.md` in the repository.

## Disclaimer

This is an unofficial project and is not affiliated with Papertrade. High leverage can lose your whole margin. Yield shown is realized history, never a promise, and nothing here is financial advice.
