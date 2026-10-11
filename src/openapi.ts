const unit = { type: 'number', description: 'USD value.' };

/** OpenAPI 3.1 description of the read-only JSON API served by this site. */
export const OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'papertrade-yield API',
    version: '0.2.0',
    summary: 'PAPER staking and yield data for Papertrade (unofficial).',
    description:
      'Read-only JSON and MCP over public Papertrade and HyperEVM data. Unofficial and not affiliated with Papertrade. Yield is quoted as USDC per 1M PAPER per day because PAPER has no market price.',
    license: { name: 'Apache-2.0', identifier: 'Apache-2.0' },
  },
  servers: [{ url: 'https://papertrade-yield.pages.dev' }],
  paths: {
    '/api/staking': {
      get: {
        operationId: 'getStaking',
        summary: 'Protocol staking state, mint curve, LP context and realized reward history',
        description: 'Cached for 60 seconds. Reward history comes from the Papertrade hourly protocol history; accRewardPerShare and totals are cross-checked on chain.',
        responses: {
          '200': { description: 'Staking snapshot.', content: { 'application/json': { schema: { $ref: '#/components/schemas/StakingSnapshot' } } } },
          '502': { description: 'Papertrade API unreachable.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/staking/claims': {
      get: {
        operationId: 'getClaims',
        summary: 'USDC claimed by stakers on chain, per hour',
        description: 'Aggregates PaperStaking Claimed logs on HyperEVM. Cached for 5 minutes.',
        parameters: [{ name: 'hours', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 72, default: 24 } }],
        responses: {
          '200': { description: 'Hourly claim buckets.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Claims' } } } },
          '400': { description: 'Invalid hours.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '502': { description: 'HyperEVM logs unavailable.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/staking/wallet': {
      get: {
        operationId: 'getWalletChain',
        summary: 'On-chain pendingReward and PAPER balance for one wallet',
        description: 'Reads PaperStaking.pendingReward(address) and PAPER.balanceOf(address) from HyperEVM. Cached for 15 seconds.',
        parameters: [{ name: 'address', in: 'query', required: true, schema: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' } }],
        responses: {
          '200': { description: 'Raw 18-decimal values as strings.', content: { 'application/json': { schema: { $ref: '#/components/schemas/WalletChain' } } } },
          '400': { description: 'Invalid address.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '502': { description: 'HyperEVM unavailable.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/mcp': {
      post: {
        operationId: 'mcp',
        summary: 'Model Context Protocol server (Streamable HTTP, stateless, JSON-RPC 2.0)',
        description:
          'Send JSON-RPC 2.0 requests (a single object or a batch of up to 20). Methods: initialize, ping, tools/list, tools/call, resources/list, resources/templates/list, prompts/list. Notifications return 202 with no body. If Accept allows only text/event-stream the reply is a single SSE message event. tools/call is limited to 60 per minute per client IP (429 with Retry-After). Tools are read-only: get_staking_stats, get_apr, get_yield_history, get_claims_activity, get_wallet_staking, project_rewards and plan_staking_action (an unsigned plan only). Nothing signs or sends funds.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/JsonRpcRequest' },
              examples: {
                listTools: { summary: 'List the tools', value: { jsonrpc: '2.0', id: 1, method: 'tools/list' } },
                callApr: { summary: 'Realized yield and APR at an assumed price', value: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_apr', arguments: { assumedPaperPriceUsd: 0.01 } } } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'JSON-RPC response (application/json) or one SSE message event (text/event-stream).', content: { 'application/json': { schema: { $ref: '#/components/schemas/JsonRpcResponse' } } } },
          '202': { description: 'Notification or client response accepted. No body.' },
          '400': { description: 'Parse error or unsupported Mcp-Protocol-Version.' },
          '413': { description: 'Body larger than 64 KB.' },
          '429': { description: 'Rate limited. See Retry-After.' },
        },
      },
      get: {
        operationId: 'mcpInfo',
        summary: 'Describe the MCP server',
        description: 'Returns a JSON description with links to the docs. With Accept: text/event-stream it returns 405 (there is no server-initiated stream).',
        responses: { '200': { description: 'Server description.' }, '405': { description: 'Event stream not offered. Allow: POST, OPTIONS.' } },
      },
    },
    '/.well-known/mcp/server-card.json': {
      get: { operationId: 'getMcpServerCard', summary: 'MCP server card (SEP-1649 shape), alias /.well-known/mcp.json', responses: { '200': { description: 'Server card with transport endpoint, capabilities and the tool list.' } } },
    },
    '/.well-known/agent-card.json': {
      get: { operationId: 'getAgentCard', summary: 'A2A agent card, alias /.well-known/agent.json', responses: { '200': { description: 'Agent card with skills mapped from the MCP tools.' } } },
    },
    '/.well-known/api-catalog': {
      get: { operationId: 'getApiCatalog', summary: 'RFC 9727 API catalog', responses: { '200': { description: 'Linkset.', content: { 'application/linkset+json': { schema: { type: 'object' } } } } } },
    },
    '/llms.txt': { get: { operationId: 'getLlmsTxt', summary: 'Index of the site for language models', responses: { '200': { description: 'Plain text.', content: { 'text/plain': { schema: { type: 'string' } } } } } } },
    '/llms-full.txt': { get: { operationId: 'getLlmsFullTxt', summary: 'The full documentation in one file', responses: { '200': { description: 'Plain text markdown.', content: { 'text/plain': { schema: { type: 'string' } } } } } } },
    '/api/papertrade/{path}': {
      get: {
        operationId: 'proxyPapertrade',
        summary: 'Same-origin proxy for the public Papertrade read API (no CORS upstream)',
        parameters: [{ name: 'path', in: 'path', required: true, schema: { type: 'string' }, description: 'Upstream path such as query/protocol/summary or state/trading.' }],
        responses: { '200': { description: 'Upstream JSON or server-sent events.' } },
      },
    },
  },
  components: {
    schemas: {
      JsonRpcRequest: {
        type: 'object',
        required: ['jsonrpc', 'method'],
        properties: {
          jsonrpc: { const: '2.0' },
          id: { type: ['string', 'integer'], description: 'Omit for notifications.' },
          method: { type: 'string', examples: ['initialize', 'tools/list', 'tools/call'] },
          params: { type: 'object' },
        },
      },
      JsonRpcResponse: {
        type: 'object',
        required: ['jsonrpc'],
        properties: {
          jsonrpc: { const: '2.0' },
          id: { type: ['string', 'integer', 'null'] },
          result: { type: 'object', description: 'For tools/call: content (text) and structuredContent, plus isError when the arguments were invalid.' },
          error: { type: 'object', properties: { code: { type: 'integer', description: '-32700 parse, -32600 invalid request, -32601 unknown method, -32602 unknown tool, -32000 rate limited.' }, message: { type: 'string' } } },
        },
      },
      Error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' } } },
      YieldWindow: {
        type: 'object',
        properties: {
          label: { type: 'string', examples: ['24h'] },
          hours: { type: 'number' },
          hoursCovered: { type: 'number', description: 'Hours of data actually used.' },
          complete: { type: 'boolean', description: 'False when the protocol has less history than the window.' },
          rewardsUsd: unit,
          avgStakedPaper: { type: 'number' },
          rewardPerPaper: { type: 'number', description: 'USDC earned per staked PAPER over the covered span.' },
          usdPer1MPaperPerDay: { type: 'number', description: 'Headline yield: USDC per 1,000,000 staked PAPER per day.' },
        },
      },
      StakingSnapshot: {
        type: 'object',
        properties: {
          generatedAt: { type: 'string', format: 'date-time' },
          source: { type: 'object', properties: { apiBlock: { type: 'integer' }, historyAsOfMs: { type: 'integer' }, chainRead: { type: 'boolean' } } },
          protocol: {
            type: 'object',
            properties: {
              paperSupply: { type: 'number' },
              paperStaked: { type: 'number' },
              stakedShare: { type: 'number', description: 'Staked PAPER divided by total supply, 0 to 1.' },
              accRewardPerShareRaw: { type: 'string', description: 'Integer scaled by 1e27.' },
              accRewardPerShareUsdPerPaper: { type: 'number' },
              pendingRewardsUsd: unit,
              minimumStakePaper: { type: 'number' },
              onchain: { type: ['object', 'null'], description: 'PaperStaking and PAPER values read from HyperEVM, or null when no RPC answered.' },
            },
          },
          mint: {
            type: 'object',
            properties: {
              rate: { type: 'number', description: 'PAPER minted per $1 of loss basis right now.' },
              trackedLpUsd: unit,
              tailProgressUsd: unit,
              onFlatBranch: { type: 'boolean' },
              curve: { type: 'array', items: { type: 'object', properties: { tailProgressUsd: { type: 'number' }, rate: { type: 'number' } } } },
            },
          },
          lp: { type: 'object', additionalProperties: { type: 'number' } },
          yield: {
            type: 'object',
            properties: {
              method: { type: 'string' },
              pricing: { type: 'string' },
              windows: { type: 'array', items: { $ref: '#/components/schemas/YieldWindow' } },
              series: { type: 'array', items: { type: 'object', additionalProperties: { type: 'number' } } },
              cumulativeRewardsUsd: unit,
              reconstructionError: { type: 'number', description: 'Relative gap between the reconstructed and on-chain accRewardPerShare.' },
            },
          },
        },
      },
      WalletChain: {
        type: 'object',
        properties: {
          address: { type: 'string' },
          pendingRewardRaw: { type: 'string', description: 'USDC wad (18 decimals) claimable now.' },
          paperBalanceRaw: { type: 'string', description: 'PAPER wad (18 decimals) held and not staked.' },
          readAt: { type: 'string', format: 'date-time' },
        },
      },
      Claims: {
        type: 'object',
        properties: {
          hours: { type: 'integer' },
          totalClaimedUsd: unit,
          claims: { type: 'integer' },
          uniqueClaimers: { type: 'integer' },
          largestClaimUsd: unit,
          buckets: { type: 'array', items: { type: 'object', properties: { t: { type: 'integer' }, claimedUsd: unit, claims: { type: 'integer' } } } },
        },
      },
    },
  },
} as const;
