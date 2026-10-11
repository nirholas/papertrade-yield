---
title: FAQ
description: Short answers about yield units, APR, wallets, data sources, the MCP server and safety.
order: 10
---

# FAQ

## Why is there no APR on the home page?

PAPER has no market price, and a percentage return needs one. The page shows USDC per million PAPER per day instead. Enter a price you want to test and it shows a simple implied APR for that price.

## Is the yield a forecast?

No. It is the USDC paid to stakers in the past, divided by the average staked PAPER. Future yield depends on trading losses, staking participation and the protocol.

## Why do the staked amount and the claims come from account history?

The contract exposes the pending reward and the token balance directly, but no per-user stake getter. The net of `Staked` and `Unstaked` events gives the stake. If a wallet has more than 600 events, `historyComplete` is `false`.

## Can the AI stake or claim for me?

No. The tools are read-only. `plan_staking_action` shows what you would sign and checks balances. Signing happens in your wallet, in the web app.

## Which AI clients work?

Any client that supports MCP over Streamable HTTP, and any framework that imports OpenAPI. See [Connect your AI](/docs/connect-your-ai/).

## Does the MCP server need a key?

No. It is public and read-only, with a per-IP rate limit.

## A tool says the history is incomplete or a window is incomplete. Why?

`complete: false` on a yield window means Papertrade has less history than the window you asked for. The figure covers all history so far and `hoursCovered` says how much.

## Where does the data come from?

The public Papertrade API at `exchange.papertrade.xyz` and public HyperEVM RPC providers. Nothing is stored.

## Is this official?

No. It is an unofficial project, not affiliated with Papertrade. Source: [github.com/nirholas/papertrade-yield](https://github.com/nirholas/papertrade-yield), licensed Apache-2.0.

## Can I open it inside Papertrade OS?

Yes: [Open in Papertrade OS](https://papertrade-os.pages.dev/?open=yield). The app also supports `?embed=1` to show only the product.
