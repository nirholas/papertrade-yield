---
title: Quickstart
description: Read PAPER staking yield, call the MCP server and connect an AI client in a few minutes.
order: 2
---

# Quickstart

No account, API key or install is needed to read data.

## 1. Read the yield

```bash
curl -s https://papertrade-yield.pages.dev/api/staking | jq '.yield.windows[] | {label, usdPer1MPaperPerDay, complete}'
```

Each window reports `usdPer1MPaperPerDay`: USDC paid to stakers per 1,000,000 staked PAPER per day, measured from real history. `complete: false` means the protocol has less history than the window asks for.

## 2. Call the MCP server

The endpoint speaks MCP Streamable HTTP and is stateless, so there is no session to open.

```bash
curl -s https://papertrade-yield.pages.dev/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

List the tools, then call one:

```bash
curl -s https://papertrade-yield.pages.dev/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

curl -s https://papertrade-yield.pages.dev/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_apr","arguments":{}}}'
```

## 3. Connect your AI

For Claude Code:

```bash
claude mcp add --transport http papertrade-yield https://papertrade-yield.pages.dev/mcp
```

Then ask: "What did PAPER stakers earn per million PAPER over the last 7 days?" Other clients are on the [Connect your AI](/docs/connect-your-ai/) page.

## 4. Look at one wallet

```bash
curl -s 'https://papertrade-yield.pages.dev/api/staking/wallet?address=0x0000000000000000000000000000000000000001'
```

Replace the address with any HyperEVM address. The response has raw 18-decimal values as strings.

## 5. Use the web app

Open [papertrade-yield.pages.dev](https://papertrade-yield.pages.dev), paste an address for a read-only view, or connect a browser wallet to stake, unstake and claim. Every action opens a confirmation dialog first, and the wallet signs.
