---
title: MCP server
description: The read-only Model Context Protocol server at /mcp: endpoint, transport behavior, tools with schemas and worked examples.
order: 5
---

# MCP server

Endpoint: `https://papertrade-yield.pages.dev/mcp`

It is an MCP **Streamable HTTP** server, stateless and read-only. There are no sessions, no cookies and no auth. Every tool reads public Papertrade and HyperEVM data. No tool signs or sends anything.

## Transport behavior

| Request | Response |
| --- | --- |
| `POST /mcp` with JSON-RPC 2.0 (single or batch of up to 20) | `application/json`. If `Accept` allows only `text/event-stream`, a single SSE `message` event. |
| `notifications/*` and client responses | `202 Accepted`, empty body. |
| `GET /mcp` with `Accept: text/event-stream` | `405`, `Allow: POST, OPTIONS`. |
| `GET /mcp` otherwise | A JSON description of the server with links to docs. |
| `DELETE /mcp` | `405`. |
| `OPTIONS /mcp` | `204` with CORS (`*`), allowing `Mcp-Session-Id`, `Mcp-Protocol-Version` and `Authorization`. |

Protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05` are supported. `initialize` echoes the client's version when supported, otherwise answers `2025-06-18`. Capabilities are `{ "tools": { "listChanged": false } }`. `resources/list`, `resources/templates/list` and `prompts/list` return empty lists.

Errors follow JSON-RPC: `-32700` parse error (HTTP 400), `-32600` invalid request, `-32601` unknown method, `-32602` unknown tool or bad params. Invalid tool **arguments** are reported as a normal result with `isError: true` so the model can correct itself. Requests over 64 KB return `413`. Calls to `tools/call` are limited to 60 per minute per client IP and return `429` with `Retry-After` and JSON-RPC code `-32000` beyond that.

## Tools

All tools carry `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` and `openWorldHint: true`. Results contain a text summary in `content` and the same data in `structuredContent`.

{{tools}}

## Examples

Realized yield with an assumed price:

```bash
curl -s https://papertrade-yield.pages.dev/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_apr","arguments":{"assumedPaperPriceUsd":0.01,"window":"7d"}}}'
```

Project rewards for a loss, assuming it was liquidated:

```bash
curl -s https://papertrade-yield.pages.dev/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"project_rewards","arguments":{"lossUsd":500,"liquidated":true,"days":30}}}'
```

Plan a claim without signing it:

```bash
curl -s https://papertrade-yield.pages.dev/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"plan_staking_action","arguments":{"action":"claim","address":"0x0000000000000000000000000000000000000001"}}}'
```

The plan contains `unsigned: true`, `signed: false`, `submitted: false`, preflight checks, the EIP-712 typed data to be signed, and a link to the web app where the wallet owner signs.

## Inspect it

```bash
npx @modelcontextprotocol/inspector --cli https://papertrade-yield.pages.dev/mcp --transport http --method tools/list
```
