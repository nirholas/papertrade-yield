import { describe, expect, it } from 'vitest';
import logsJson from './fixtures/logs.json';
import { aggregateClaims } from '../src/claims';
import { decodeStakingLog, type RawLog, type StakingEvent } from '../src/events';

const events = (logsJson as unknown as RawLog[]).map(decodeStakingLog).filter((e): e is StakingEvent => e !== null);
const claimed = events.filter((e) => e.kind === 'Claimed');
const lastTs = Math.max(...events.map((e) => e.timestamp ?? 0));

describe('aggregateClaims on recorded logs', () => {
  const nowMs = lastTs * 1000;
  const s = aggregateClaims(events, { nowMs, hours: 24 });

  it('has one bucket per hour, contiguous', () => {
    expect(s.buckets).toHaveLength(24);
    for (let i = 1; i < s.buckets.length; i++) expect(s.buckets[i].t - s.buckets[i - 1].t).toBe(3_600_000);
  });
  it('counts every recorded claim inside the window', () => {
    expect(claimed.length).toBeGreaterThan(0);
    expect(s.claims).toBe(claimed.length);
    expect(s.uniqueClaimers).toBe(new Set(claimed.map((e) => e.user)).size);
  });
  it('bucket totals add up to the summary total', () => {
    expect(s.buckets.reduce((a, b) => a + b.claimedUsd, 0)).toBeCloseTo(s.totalClaimedUsd, 9);
    expect(s.buckets.reduce((a, b) => a + b.claims, 0)).toBe(s.claims);
    expect(s.largestClaimUsd).toBeLessThanOrEqual(s.totalClaimedUsd);
  });
  it('ignores events outside the window and non-claims', () => {
    expect(aggregateClaims(events, { nowMs: nowMs + 10 * 86_400_000, hours: 1 }).claims).toBe(0);
    expect(aggregateClaims(events.filter((e) => e.kind !== 'Claimed'), { nowMs, hours: 24 }).claims).toBe(0);
  });
});
