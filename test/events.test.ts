import { decodeEventLog, toEventSelector, toFunctionSelector } from 'viem';
import { describe, expect, it } from 'vitest';
import logsJson from './fixtures/logs.json';
import { PAPER_STAKING_EVENTS_ABI, TOPICS, decodeStakingLog, type RawLog } from '../src/events';
import { SELECTORS } from '../src/rpc';

const logs = logsJson as unknown as RawLog[];

describe('topic hashes', () => {
  it('match the event signatures', () => {
    expect(TOPICS.Staked).toBe(toEventSelector('Staked(address,uint256)'));
    expect(TOPICS.Unstaked).toBe(toEventSelector('Unstaked(address,uint256)'));
    expect(TOPICS.Claimed).toBe(toEventSelector('Claimed(address,uint256)'));
    expect(TOPICS.NonceUsed).toBe(toEventSelector('NonceUsed(address,uint256,uint256)'));
  });
  it('function selectors match their signatures', () => {
    expect(SELECTORS.accRewardPerShare).toBe(toFunctionSelector('accRewardPerShare()'));
    expect(SELECTORS.totalStaked).toBe(toFunctionSelector('totalStaked()'));
    expect(SELECTORS.pendingReward).toBe(toFunctionSelector('pendingReward(address)'));
    expect(SELECTORS.balanceOf).toBe(toFunctionSelector('balanceOf(address)'));
    expect(SELECTORS.totalSupply).toBe(toFunctionSelector('totalSupply()'));
  });
});

describe('decodeStakingLog against recorded mainnet logs', () => {
  it('recorded a real mix of events', () => {
    expect(logs.length).toBeGreaterThan(10);
    const names = new Set(logs.map((l) => l.topics[0]));
    expect(names.has(TOPICS.NonceUsed)).toBe(true);
  });

  it('agrees with viem decodeEventLog on every Staked, Unstaked and Claimed log', () => {
    let checked = 0;
    for (const log of logs) {
      const ours = decodeStakingLog(log);
      if (log.topics[0] === TOPICS.NonceUsed) {
        expect(ours).toBeNull();
        continue;
      }
      expect(ours).not.toBeNull();
      const ref = decodeEventLog({ abi: PAPER_STAKING_EVENTS_ABI, data: log.data, topics: log.topics as [`0x${string}`, ...`0x${string}`[]] });
      expect(ref.eventName).toBe(ours!.kind);
      const args = ref.args as unknown as { user: string; amount: bigint };
      expect(ours!.user).toBe(args.user.toLowerCase());
      expect(ours!.amountRaw).toBe(args.amount);
      expect(ours!.txHash).toBe(log.transactionHash);
      expect(ours!.blockNumber).toBe(parseInt(log.blockNumber, 16));
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('rejects malformed logs', () => {
    const base = logs.find((l) => l.topics[0] === TOPICS.Claimed)!;
    expect(decodeStakingLog({ ...base, data: '0x00' })).toBeNull();
    expect(decodeStakingLog({ ...base, topics: [base.topics[0]] })).toBeNull();
    expect(decodeStakingLog({ ...base, topics: ['0x' + '11'.repeat(32) as `0x${string}`, base.topics[1]] })).toBeNull();
  });
});
