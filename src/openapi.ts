const unit = { type: 'number', description: 'USD value.' };

/** OpenAPI 3.1 description of the read-only JSON API served by this site. */
export const OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'papertrade-yield API',
    version: '0.1.0',
    summary: 'PAPER staking and yield data for Papertrade (unofficial).',
    description:
      'Read-only JSON over public Papertrade and HyperEVM data. Unofficial and not affiliated with Papertrade. Yield is quoted as USDC per 1M PAPER per day because PAPER has no market price.',
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
