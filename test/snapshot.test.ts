import { describe, expect, it } from 'vitest';
import summary from './fixtures/summary.json';
import trading from './fixtures/trading.json';
import history from './fixtures/history-1h.json';
import chain from './fixtures/chain.json';
import wallet from './fixtures/wallet-snapshot.json';
import { buildSnapshot } from '../src/snapshot';
import { pendingStakingRewardRaw, ACC_REWARD_PRECISION } from 'papertrade-sdk';

const build = (withChain: boolean) =>
  buildSnapshot({
    now: history.source.asOfMs,
    summary: summary as never,
    trading: trading as never,
    history: history as never,
    chain: withChain ? { accRewardPerShareRaw: BigInt(chain.accRewardPerShare), totalStakedRaw: 0n, paperSupplyRaw: 0n } : null,
  });

describe('buildSnapshot on recorded responses', () => {
  const s = build(true);
  it('reports a staked share between 0 and 1', () => {
    expect(s.protocol.paperSupply).toBeGreaterThan(0);
    expect(s.protocol.stakedShare).toBeGreaterThanOrEqual(0);
    expect(s.protocol.stakedShare).toBeLessThanOrEqual(1);
  });
  it('flags whether the API and chain accumulators agree', () => {
    expect(s.protocol.onchain?.accMatchesApi).toBe(chain.accRewardPerShare === trading.accRewardPerShareRaw);
    expect(build(false).protocol.onchain).toBeNull();
  });
  it('mint rate matches the curve and the flat branch flag', () => {
    expect(s.mint.rate).toBeGreaterThan(0);
    expect(s.mint.rate).toBeLessThanOrEqual(100);
    expect(s.mint.onFlatBranch).toBe(s.mint.trackedLpUsd < 2_000_000);
    expect(s.mint.curve.length).toBeGreaterThan(10);
  });
  it('states the method and the pricing caveat', () => {
    expect(s.yield.method).toMatch(/Realized, not forecast/);
    expect(s.yield.pricing).toMatch(/no market price/);
    expect(s.yield.windows).toHaveLength(3);
  });
  it('contains no dash glyphs in user-facing text', () => {
    expect(JSON.stringify([s.yield.method, s.yield.pricing])).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('wallet pending reward math against the recorded chain value', () => {
  it('local formula equals on-chain pendingReward', () => {
    const w = wallet as { paper: { staked: string; pendingBase: string; rewardDebt: string } };
    const local = pendingStakingRewardRaw({
      pendingBaseRaw: BigInt(w.paper.pendingBase),
      stakedRaw: BigInt(w.paper.staked),
      accRewardPerShareRaw: BigInt(chain.accRewardPerShare),
      rewardDebtRaw: BigInt(w.paper.rewardDebt),
    });
    expect(ACC_REWARD_PRECISION).toBe(10n ** 27n);
    const diff = local > BigInt(chain.pendingReward) ? local - BigInt(chain.pendingReward) : BigInt(chain.pendingReward) - local;
    expect(diff).toBeLessThanOrEqual(10n ** 15n);
  });
});
