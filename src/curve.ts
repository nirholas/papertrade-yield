import { PAPER_MINT_CURVE, paperMintRate } from 'papertrade-sdk';

export interface CurvePoint {
  /** Tail-progress high-water mark in USD. */
  tailProgressUsd: number;
  /** PAPER minted per $1 of loss basis at that point. */
  rate: number;
}

/** Sample the decay branch of the mint curve (tracked LP above the flat threshold) from 0 to `maxTailUsd`. */
export function sampleMintCurve(maxTailUsd: number, steps = 120): CurvePoint[] {
  const points: CurvePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const tailProgressUsd = (maxTailUsd * i) / steps;
    points.push({ tailProgressUsd, rate: paperMintRate({ trackedLpUsd: PAPER_MINT_CURVE.lpFlatThresholdUsd, tailProgressUsd }) });
  }
  return points;
}

export interface LossProjection {
  lossUsd: number;
  mintBasisUsd: number;
  paperMinted: number;
  rate: number;
  usdPerDay: number;
  usdPerYear: number;
  /** Days of yield (at the quoted pace) needed to earn back the loss. */
  breakEvenDays: number | null;
}

/** Loss basis: a normal losing close mints on 98% of the loss, a liquidation on the full margin. */
export function projectLoss(params: {
  lossUsd: number;
  liquidated: boolean;
  rate: number;
  usdPer1MPaperPerDay: number;
}): LossProjection {
  const mintBasisUsd = params.liquidated ? params.lossUsd : params.lossUsd * 0.98;
  const paperMinted = mintBasisUsd * params.rate;
  const usdPerDay = (paperMinted / 1_000_000) * params.usdPer1MPaperPerDay;
  return {
    lossUsd: params.lossUsd,
    mintBasisUsd,
    paperMinted,
    rate: params.rate,
    usdPerDay,
    usdPerYear: usdPerDay * 365,
    breakEvenDays: usdPerDay > 0 ? params.lossUsd / usdPerDay : null,
  };
}
