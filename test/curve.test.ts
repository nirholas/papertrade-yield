import { PAPER_MINT_CURVE, paperMintRate } from 'papertrade-sdk';
import { describe, expect, it } from 'vitest';
import { projectLoss, sampleMintCurve } from '../src/curve';

describe('sampleMintCurve', () => {
  const curve = sampleMintCurve(600_000_000, 60);
  it('starts at the flat rate and never increases', () => {
    expect(curve[0].rate).toBe(100);
    for (let i = 1; i < curve.length; i++) expect(curve[i].rate).toBeLessThanOrEqual(curve[i - 1].rate);
  });
  it('matches the SDK at every sampled point', () => {
    for (const p of curve) expect(p.rate).toBe(paperMintRate({ trackedLpUsd: PAPER_MINT_CURVE.lpFlatThresholdUsd, tailProgressUsd: p.tailProgressUsd }));
  });
  it('spans 0 to the requested tail', () => {
    expect(curve).toHaveLength(61);
    expect(curve[60].tailProgressUsd).toBe(600_000_000);
  });
});

describe('projectLoss', () => {
  it('mints on 98 percent of a normal losing close', () => {
    const p = projectLoss({ lossUsd: 1000, liquidated: false, rate: 50, usdPer1MPaperPerDay: 200 });
    expect(p.mintBasisUsd).toBeCloseTo(980, 9);
    expect(p.paperMinted).toBeCloseTo(49_000, 9);
    expect(p.usdPerDay).toBeCloseTo(9.8, 9);
    expect(p.usdPerYear).toBeCloseTo(9.8 * 365, 6);
    expect(p.breakEvenDays).toBeCloseTo(1000 / 9.8, 6);
  });
  it('mints on the full margin when liquidated', () => {
    expect(projectLoss({ lossUsd: 1000, liquidated: true, rate: 10, usdPer1MPaperPerDay: 0 }).paperMinted).toBe(10_000);
  });
  it('has no break-even without yield', () => {
    expect(projectLoss({ lossUsd: 100, liquidated: false, rate: 100, usdPer1MPaperPerDay: 0 }).breakEvenDays).toBeNull();
  });
});
