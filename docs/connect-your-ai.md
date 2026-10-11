---
title: Connect your AI
description: Copy-paste setup for Claude Code, Claude Desktop, claude.ai, the Claude API, Codex, the OpenAI Responses API, ChatGPT, Gemini CLI, Cursor, VS Code, Windsurf, Zed, Cline, Goose and Continue.
order: 6
---

# Connect your AI

The MCP URL is the same everywhere:

```text
https://papertrade-yield.pages.dev/mcp
```

It needs no API key or OAuth. Client configuration formats change, so each section names the format it was checked against. If a client rejects a snippet, check its current MCP docs and keep the URL.

## Claude Code

```bash
claude mcp add --transport http papertrade-yield https://papertrade-yield.pages.dev/mcp
```

Add `--scope project` to write a shared `.mcp.json`, or `--scope user` for all projects. The file form:

```json
{
  "mcpServers": {
    "papertrade-yield": {
      "type": "http",
      "url": "https://papertrade-yield.pages.dev/mcp"
    }
  }
}
```

## Claude Desktop and claude.ai

Open Settings, then Connectors, click Add, choose **Add custom connector**, paste the URL and click Add. Connectors can also be enabled per conversation from the "Add files, connectors, and more" menu.

For a Claude Desktop build that only loads local stdio servers, bridge with `mcp-remote` in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "papertrade-yield": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://papertrade-yield.pages.dev/mcp"]
    }
  }
}
```

## Claude API (MCP connector)

Send the beta header `anthropic-beta: mcp-client-2025-11-20`. Declare the server in `mcp_servers` and enable it with an `mcp_toolset` entry in `tools`:

```bash
curl https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: mcp-client-2025-11-20" \
  -d '{
    "model": "claude-sonnet-5-5",
    "max_tokens": 1000,
    "messages": [{"role": "user", "content": "What did PAPER stakers earn per 1M PAPER per day this week?"}],
    "mcp_servers": [
      {"type": "url", "url": "https://papertrade-yield.pages.dev/mcp", "name": "papertrade-yield"}
    ],
    "tools": [
      {"type": "mcp_toolset", "mcp_server_name": "papertrade-yield"}
    ]
  }'
```

With the Python SDK use `client.beta.messages.create(..., mcp_servers=[...], tools=[{"type": "mcp_toolset", "mcp_server_name": "papertrade-yield"}], betas=["mcp-client-2025-11-20"])`.

## OpenAI Codex CLI

```bash
codex mcp add papertrade-yield --url https://papertrade-yield.pages.dev/mcp
```

Or edit `~/.codex/config.toml`:

```toml
[mcp_servers.papertrade-yield]
url = "https://papertrade-yield.pages.dev/mcp"
```

## OpenAI Responses API

```json
{
  "model": "gpt-5",
  "input": "What is the realized PAPER staking yield over 7 days?",
  "tools": [
    {
      "type": "mcp",
      "server_label": "papertrade_yield",
      "server_description": "Read-only PAPER staking and yield data for Papertrade (unofficial).",
      "server_url": "https://papertrade-yield.pages.dev/mcp",
      "require_approval": "never",
      "allowed_tools": ["get_staking_stats", "get_apr", "get_yield_history", "get_claims_activity", "get_wallet_staking", "project_rewards", "plan_staking_action"]
    }
  ]
}
```

All tools are read-only, so `require_approval: "never"` is safe here. Use `"always"` if you prefer to review each call.

## ChatGPT

In ChatGPT, enable **Developer mode** (Settings, Apps and Connectors, Advanced settings; availability depends on plan and OpenAI moves this setting from time to time). Then create a connector: give it a name, paste `https://papertrade-yield.pages.dev/mcp` as the server URL and choose no authentication. Enable the connector in a chat from the tools menu.

## Gemini CLI

```bash
gemini mcp add --transport http papertrade-yield https://papertrade-yield.pages.dev/mcp
```

Or in `~/.gemini/settings.json`, which uses `httpUrl` for Streamable HTTP:

```json
{
  "mcpServers": {
    "papertrade-yield": {
      "httpUrl": "https://papertrade-yield.pages.dev/mcp"
    }
  }
}
```

## Cursor

`.cursor/mcp.json` in a project, or `~/.cursor/mcp.json` globally:

```json
{
  "mcpServers": {
    "papertrade-yield": {
      "url": "https://papertrade-yield.pages.dev/mcp"
    }
  }
}
```

## VS Code

`.vscode/mcp.json`:

```json
{
  "servers": {
    "papertrade-yield": {
      "type": "http",
      "url": "https://papertrade-yield.pages.dev/mcp"
    }
  }
}
```

Or run **MCP: Add Server** from the command palette and choose HTTP.

## Windsurf

`~/.codeium/windsurf/mcp_config.json`. Windsurf uses `serverUrl` for remote servers:

```json
{
  "mcpServers": {
    "papertrade-yield": {
      "serverUrl": "https://papertrade-yield.pages.dev/mcp"
    }
  }
}
```

Press refresh in the MCP panel after saving.

## Zed

In `settings.json`, under `context_servers`:

```json
{
  "context_servers": {
    "papertrade-yield": {
      "url": "https://papertrade-yield.pages.dev/mcp"
    }
  }
}
```

If Zed starts an OAuth prompt, the server does not need one. Use the `mcp-remote` bridge shown in the Claude Desktop section as a `command` entry instead.

## Cline

`cline_mcp_settings.json` (MCP Servers panel, Configure MCP Servers):

```json
{
  "mcpServers": {
    "papertrade-yield": {
      "url": "https://papertrade-yield.pages.dev/mcp",
      "type": "streamableHttp",
      "disabled": false
    }
  }
}
```

## Goose

Run `goose configure`, choose Add Extension, then Remote Extension (Streamable HTTP), and enter the name and the URL. Or add it to `~/.config/goose/config.yaml`:

```yaml
extensions:
  papertrade-yield:
    name: papertrade-yield
    type: streamable_http
    uri: https://papertrade-yield.pages.dev/mcp
    enabled: true
    timeout: 300
```

For one session only: `goose session --with-streamable-http-extension https://papertrade-yield.pages.dev/mcp`.

## Continue

`~/.continue/config.yaml` or a file in `.continue/mcpServers/`:

```yaml
name: Papertrade Yield
version: 0.0.1
schema: v1
mcpServers:
  - name: papertrade-yield
    type: streamable-http
    url: https://papertrade-yield.pages.dev/mcp
```

## Any other agent framework (OpenAPI)

Frameworks that import OpenAPI tools (LangChain, LlamaIndex, the OpenAI Agents SDK, Dify, n8n and similar) can load `https://papertrade-yield.pages.dev/openapi.json` directly. It describes the JSON API and the `/mcp` endpoint. The A2A agent card at `/.well-known/agent-card.json` lists the same capabilities as skills. See [Agent discovery](/docs/agent-discovery/).

## Try it

Once connected, ask:

- "What did PAPER stakers earn per million PAPER over the last 24 hours and 7 days?"
- "If I assume PAPER is worth $0.02, what is the implied APR?"
- "How much PAPER would a $300 liquidated loss mint, and what would it earn in 30 days?"
- "Show wallet 0x... : staked PAPER, pending rewards, lifetime claims."
- "Plan a claim for 0x... and tell me what I would need to sign."

The last one returns a plan only. You sign in your own wallet, never through the AI.
