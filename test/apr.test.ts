import { describe, expect, it } from 'vitest';
import history from './fixtures/history-1h.json';
import chain from './fixtures/chain.json';
import { HOUR_MS, aprPercent, buildRewardSeries, dailyEarnings, reconstructionError, yieldWindow, yieldWindows, type HistoryInput } from '../src/apr';

const input: HistoryInput = {
  startMs: history.startMs,
  intervalMs: history.intervalMs,
  asOfMs: history.source.asOfMs,
  columns: history.columns,
};
const points = buildRewardSeries(input);

describe('buildRewardSeries (recorded protocol history)', () => {
  it('skips buckets before staking rewards began', () => {
    expect(points.length).toBeGreaterThan(0);
    expect(points.length).toBeLessThan(history.columns.paperRevenue.length);
    for (const p of points) {
      expect(p.rewardUsd).toBeGreaterThan(0);
      expect(p.avgStakedPaper).toBeGreaterThan(0);
      expect(p.spanHours).toBeGreaterThan(0);
      expect(p.spanHours).toBeLessThanOrEqual(1);
    }
  });

  it('reward per PAPER equals reward divided by average staked', () => {
    for (const p of points) expect(p.rewardPerPaper).toBeCloseTo(p.rewardUsd / p.avgStakedPaper, 18);
  });

  it('per-bucket rewards sum to the cumulative staking rewards column', () => {
    const sum = points.reduce((s, p) => s + p.rewardUsd, 0);
    const cumulative = history.columns.stakingRewards[history.columns.stakingRewards.length - 1];
    expect(Math.abs(sum - cumulative) / cumulative).toBeLessThan(0.01);
  });

  it('only the last bucket can be shorter than the interval', () => {
    for (const p of points.slice(0, -1)) expect(p.spanHours).toBe(1);
  });
});

describe('yieldWindow', () => {
  it('24h window uses exactly 24 hours when history allows it', () => {
    const w = yieldWindow(points, '24h', 24);
    if (points.reduce((s, p) => s + p.spanHours, 0) >= 24) {
      expect(w.complete).toBe(true);
      expect(w.hoursCovered).toBeCloseTo(24, 6);
    } else {
      expect(w.complete).toBe(false);
    }
  });

  it('marks windows longer than the history incomplete and uses all of it', () => {
    const total = points.reduce((s, p) => s + p.spanHours, 0);
    const w = yieldWindow(points, '30d', 720);
    expect(w.complete).toBe(false);
    expect(w.hoursCovered).toBeCloseTo(total, 6);
    expect(w.rewardsUsd).toBeCloseTo(points.reduce((s, p) => s + p.rewardUsd, 0), 6);
  });

  it('per-day yield is reward per PAPER over covered hours scaled to a day and 1M PAPER', () => {
    const w = yieldWindow(points, '24h', 24);
    expect(w.usdPer1MPaperPerDay).toBeCloseTo((w.rewardPerPaper / w.hoursCovered) * 24 * 1_000_000, 6);
  });

  it('pro-rates the oldest bucket', () => {
    const w = yieldWindow(points, 'half', 0.5);
    const last = points[points.length - 1];
    const use = Math.min(0.5, last.spanHours);
    expect(w.hoursCovered).toBeCloseTo(use, 9);
    expect(w.rewardsUsd).toBeCloseTo(last.rewardUsd * (use / last.spanHours), 9);
  });

  it('returns zeros for an empty series', () => {
    const w = yieldWindow([], '24h', 24);
    expect(w).toMatchObject({ hoursCovered: 0, complete: false, rewardsUsd: 0, usdPer1MPaperPerDay: 0, avgStakedPaper: 0 });
  });

  it('yieldWindows returns 24h, 7d and 30d in order', () => {
    expect(yieldWindows(points).map((w) => [w.label, w.hours])).toEqual([['24h', 24], ['7d', 168], ['30d', 720]]);
  });

  it('a synthetic constant stream gives a closed-form answer', () => {
    const flat = Array.from({ length: 48 }, (_, i) => ({ t: i * HOUR_MS, spanHours: 1, rewardUsd: 10, avgStakedPaper: 1_000_000, rewardPerPaper: 10 / 1_000_000 }));
    const w = yieldWindow(flat, '24h', 24);
    expect(w.complete).toBe(true);
    expect(w.rewardsUsd).toBeCloseTo(240, 9);
    expect(w.usdPer1MPaperPerDay).toBeCloseTo(240, 6);
  });
});

describe('aprPercent and dailyEarnings', () => {
  it('has no APR without a price', () => {
    expect(aprPercent(100, 0)).toBeNull();
    expect(aprPercent(100, -1)).toBeNull();
  });
  it('is simple and non-compounding', () => {
    expect(aprPercent(1000, 0.01)).toBeCloseTo(((1000 / 1_000_000) * 365 / 0.01) * 100, 9);
  });
  it('scales daily earnings linearly with the stake', () => {
    expect(dailyEarnings(2_000_000, 50)).toBe(100);
    expect(dailyEarnings(0, 50)).toBe(0);
  });
});

describe('reconstructionError against the recorded on-chain accRewardPerShare', () => {
  it('lands within 5 percent of the chain value (trapezoid beats end-of-bucket and start-of-bucket averages)', () => {
    const err = reconstructionError(points, BigInt(chain.accRewardPerShare));
    expect(Math.abs(err)).toBeLessThan(0.05);
  });
  it('is zero when the on-chain accumulator is zero', () => {
    expect(reconstructionError(points, 0n)).toBe(0);
  });
});
