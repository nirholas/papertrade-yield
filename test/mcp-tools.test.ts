import { beforeEach, describe, expect, it } from 'vitest';
import { handleMcp, resetRateLimits } from '../site/functions/_lib/mcp';
import { serverConfig, TOOLS, type ToolContext } from '../src/mcp-tools';
import { recordedData } from './helpers';

const WALLET = '0x4cefdabb57b46daf2dee3344ad9317c2d8dbebcc';
const ctx = (calls: string[] = []): ToolContext => ({ data: recordedData(calls), siteUrl: 'https://papertrade-yield.pages.dev' });

async function call(name: string, args: Record<string, unknown> = {}, calls: string[] = []) {
  const res = await handleMcp(
    new Request('https://papertrade-yield.pages.dev/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    }),
    serverConfig(),
    ctx(calls),
  );
  return (await res.json()).result as { isError?: boolean; content: Array<{ type: string; text: string }>; structuredContent: Record<string, any> };
}

beforeEach(() => resetRateLimits());

describe('tool catalogue', () => {
  it('every tool is read only, documented, and has input and output schemas', () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(4);
    for (const t of TOOLS) {
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.annotations.destructiveHint).toBe(false);
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe('object');
      expect(t.outputSchema.type).toBe('object');
      expect(JSON.stringify(t)).not.toMatch(/[–—]/);
    }
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });
});

describe('get_staking_stats', () => {
  it('returns real recorded protocol data with yield windows and no APR', async () => {
    const r = await call('get_staking_stats');
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent.paperStaked).toBeGreaterThan(0);
    expect(r.structuredContent.yieldWindows).toHaveLength(3);
    expect(r.structuredContent.yieldWindows[0].impliedAprPercent).toBeNull();
    expect(r.content[0].text).toMatch(/no market price/);
  });
});

describe('get_apr', () => {
  it('computes a simple APR only for a supplied price', async () => {
    const without = await call('get_apr', { window: '7d' });
    expect(without.structuredContent.windows).toHaveLength(1);
    expect(without.structuredContent.windows[0].impliedAprPercent).toBeNull();
    const withPrice = await call('get_apr', { window: '7d', assumedPaperPriceUsd: 0.001 });
    const w = withPrice.structuredContent.windows[0];
    expect(w.impliedAprPercent).toBeCloseTo(((w.usdPer1MPaperPerDay / 1e6) * 365 / 0.001) * 100, 6);
  });
  it('rejects a non-positive price', async () => {
    const r = await call('get_apr', { assumedPaperPriceUsd: 0 });
    expect(r.isError).toBe(true);
  });
});

describe('get_yield_history', () => {
  it('returns the requested number of trailing buckets', async () => {
    const r = await call('get_yield_history', { hours: 5 });
    expect(r.structuredContent.points).toHaveLength(5);
    expect(r.structuredContent.totalRewardsUsd).toBeCloseTo(r.structuredContent.points.reduce((s: number, p: { rewardUsd: number }) => s + p.rewardUsd, 0), 9);
  });
});

describe('get_wallet_staking', () => {
  it('combines on-chain reads with account history', async () => {
    const calls: string[] = [];
    const r = await call('get_wallet_staking', { address: WALLET.toUpperCase().replace('0X', '0x') }, calls);
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent.pendingRewardUsd).toBeCloseTo(0.5, 9);
    expect(r.structuredContent.paperUnstakedBalance).toBeCloseTo(1000, 9);
    expect(r.structuredContent.paperStaked).toBeGreaterThan(0);
    expect(r.structuredContent.lifetimeClaimedUsd).toBeGreaterThan(0);
    expect(r.structuredContent.historyComplete).toBe(true);
    expect(calls.filter((u) => u.includes('/staking'))).toHaveLength(1);
  });
  it('refuses a malformed address before any upstream call', async () => {
    const calls: string[] = [];
    const r = await call('get_wallet_staking', { address: '0x123' }, calls);
    expect(r.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('project_rewards', () => {
  it('needs exactly one of paperAmount and lossUsd', async () => {
    expect((await call('project_rewards', {})).isError).toBe(true);
    expect((await call('project_rewards', { paperAmount: 1, lossUsd: 1 })).isError).toBe(true);
  });
  it('projects a PAPER position from the realized pace', async () => {
    const r = await call('project_rewards', { paperAmount: 2_000_000, days: 10, window: '7d' });
    const s = r.structuredContent;
    expect(s.projectedUsdPerDay).toBeCloseTo(2 * s.usdPer1MPaperPerDay, 6);
    expect(s.projectedUsdOverDays).toBeCloseTo(s.projectedUsdPerDay * 10, 9);
    expect(s.caveat).toMatch(/Not a forecast/);
  });
  it('converts a loss to PAPER at the current mint rate', async () => {
    const r = await call('project_rewards', { lossUsd: 1000, liquidated: false });
    expect(r.structuredContent.paperAmount).toBeCloseTo(980 * r.structuredContent.mintRate, 6);
  });
});

describe('plan_staking_action', () => {
  it('is unsigned, unsubmitted and carries the EIP-712 shape for a valid stake', async () => {
    const r = await call('plan_staking_action', { action: 'stake', address: WALLET, amountPaper: '1000' });
    const s = r.structuredContent;
    expect(s).toMatchObject({ unsigned: true, signed: false, submitted: false, action: 'stake', intentAction: 'paperStake' });
    expect(s.amountRaw).toBe((1000n * 10n ** 18n).toString());
    expect(s.typedData.primaryType).toBe('Stake');
    expect(s.typedData.domain).toMatchObject({ name: 'PaperStaking', chainId: 999 });
    expect(s.typedData.types.Stake.map((f: { name: string }) => f.name)).toEqual(['user', 'amount', 'nonce', 'deadline']);
    expect(s.preflight.ok).toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/"(r|s|v|signature)"/);
  });
  it('blocks a stake larger than the wallet balance', async () => {
    const r = await call('plan_staking_action', { action: 'stake', address: WALLET, amountPaper: '5000' });
    expect(r.structuredContent.preflight.ok).toBe(false);
    expect(r.structuredContent.preflight.checks.find((c: { name: string }) => c.name === 'paper_balance').ok).toBe(false);
  });
  it('blocks a stake below the minimum', async () => {
    const r = await call('plan_staking_action', { action: 'stake', address: WALLET, amountPaper: '10' });
    expect(r.structuredContent.preflight.checks.find((c: { name: string }) => c.name === 'minimum_stake').ok).toBe(false);
  });
  it('blocks an unstake above the staked amount', async () => {
    const r = await call('plan_staking_action', { action: 'unstake', address: WALLET, amountPaper: '999999999' });
    expect(r.structuredContent.preflight.ok).toBe(false);
  });
  it('plans a claim from the pending reward and needs no amount', async () => {
    const r = await call('plan_staking_action', { action: 'claim', address: WALLET });
    expect(r.structuredContent).toMatchObject({ action: 'claim', amountRaw: null, signed: false });
    expect(r.structuredContent.preflight.ok).toBe(true);
    expect(r.structuredContent.typedData.types.Claim).toBeDefined();
  });
  it('requires an amount to stake', async () => {
    expect((await call('plan_staking_action', { action: 'stake', address: WALLET })).isError).toBe(true);
  });
});
