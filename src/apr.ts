/**
 * Reward-history and yield math. Pure functions over the Papertrade protocol
 * history (hourly buckets), so every number can be reproduced from the recorded
 * fixtures in test/fixtures.
 *
 * Method, stated exactly:
 *   - `stakingRewards` is the cumulative USDC distributed to PAPER stakers and
 *     `paperRevenue` is the per-bucket increment (they agree to the cent).
 *   - A bucket's reward per staked PAPER is `reward / averageStaked`, where
 *     averageStaked is the mean of the staked PAPER at the end of the previous
 *     bucket and at the end of this one (the stake changes during the bucket,
 *     so the end value alone would understate yield while stake is growing).
 *   - The newest bucket is still open, so its span is only the time elapsed.
 *   - A window of W hours takes the open bucket, then whole buckets back in
 *     time, pro-rating the oldest one, so the window covers exactly W hours when
 *     history allows. Yield is quoted per 1M PAPER per day.
 */

export interface HistoryColumns {
  stakingRewards: number[];
  paperRevenue: number[];
  paperStaked: number[];
}

export interface HistoryInput {
  startMs: number;
  intervalMs: number;
  columns: HistoryColumns;
  asOfMs: number;
}

export interface RewardPoint {
  /** Bucket start, unix ms. */
  t: number;
  /** Hours this bucket covers (shorter than the interval for the open bucket). */
  spanHours: number;
  /** USDC distributed to stakers in the bucket. */
  rewardUsd: number;
  /** Mean staked PAPER over the bucket. */
  avgStakedPaper: number;
  /** USDC earned per staked PAPER in the bucket. */
  rewardPerPaper: number;
}

export interface YieldWindow {
  label: string;
  /** Requested window length in hours. */
  hours: number;
  /** Hours of data actually used (less than `hours` when history is shorter). */
  hoursCovered: number;
  /** True when the whole requested window is covered. */
  complete: boolean;
  rewardsUsd: number;
  /** Time-weighted mean staked PAPER (rewards-weighted harmonic mean is not used; this is the plain mean of bucket averages weighted by span). */
  avgStakedPaper: number;
  /** USDC earned per staked PAPER over the covered span. */
  rewardPerPaper: number;
  /** Headline metric: USDC earned per 1,000,000 staked PAPER per day, extrapolated from the covered span. */
  usdPer1MPaperPerDay: number;
}

export const HOUR_MS = 3_600_000;
export const WINDOWS = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
] as const;

/** Build per-bucket reward points, skipping the empty buckets before staking rewards began. */
export function buildRewardSeries(history: HistoryInput): RewardPoint[] {
  const { columns, startMs, intervalMs, asOfMs } = history;
  const n = columns.paperRevenue.length;
  const points: RewardPoint[] = [];
  for (let i = 0; i < n; i++) {
    const rewardUsd = columns.paperRevenue[i];
    const staked = columns.paperStaked[i];
    if (!(rewardUsd > 0) || !(staked > 0)) continue;
    const t = startMs + i * intervalMs;
    const spanMs = Math.min(intervalMs, Math.max(0, asOfMs - t));
    if (spanMs <= 0) continue;
    const prev = i > 0 ? columns.paperStaked[i - 1] : 0;
    const avgStakedPaper = prev > 0 ? (prev + staked) / 2 : staked;
    points.push({ t, spanHours: spanMs / HOUR_MS, rewardUsd, avgStakedPaper, rewardPerPaper: rewardUsd / avgStakedPaper });
  }
  return points;
}

/** Yield over the trailing `hours`, taking the open bucket first and whole buckets back in time. */
export function yieldWindow(points: RewardPoint[], label: string, hours: number): YieldWindow {
  let remaining = hours;
  let rewardsUsd = 0;
  let rewardPerPaper = 0;
  let stakedWeighted = 0;
  let covered = 0;
  for (let i = points.length - 1; i >= 0 && remaining > 1e-9; i--) {
    const p = points[i];
    const use = Math.min(remaining, p.spanHours);
    const frac = use / p.spanHours;
    rewardsUsd += p.rewardUsd * frac;
    rewardPerPaper += p.rewardPerPaper * frac;
    stakedWeighted += p.avgStakedPaper * use;
    covered += use;
    remaining -= use;
  }
  const perDay = covered > 0 ? (rewardPerPaper / covered) * 24 : 0;
  return {
    label,
    hours,
    hoursCovered: covered,
    complete: remaining <= 1e-6,
    rewardsUsd,
    avgStakedPaper: covered > 0 ? stakedWeighted / covered : 0,
    rewardPerPaper,
    usdPer1MPaperPerDay: perDay * 1_000_000,
  };
}

export function yieldWindows(points: RewardPoint[]): YieldWindow[] {
  return WINDOWS.map((w) => yieldWindow(points, w.label, w.hours));
}

/**
 * Simple (non-compounding) APR in percent for a PAPER price in USD. PAPER has no
 * market price, so this is only meaningful with an assumed price. Rewards are
 * paid in USDC, so they cannot compound into more PAPER without a trade.
 */
export function aprPercent(usdPer1MPaperPerDay: number, paperPriceUsd: number): number | null {
  if (!(paperPriceUsd > 0)) return null;
  const perPaperPerYear = (usdPer1MPaperPerDay / 1_000_000) * 365;
  return (perPaperPerYear / paperPriceUsd) * 100;
}

/** Projected USDC per day for a position, at a quoted yield per 1M PAPER per day. */
export function dailyEarnings(paperAmount: number, usdPer1MPaperPerDay: number): number {
  return (paperAmount / 1_000_000) * usdPer1MPaperPerDay;
}

/**
 * Cross-check: summing the reconstructed reward per PAPER since staking began
 * should land near the on-chain accRewardPerShare (1e27 precision). Returns the
 * relative difference (reconstructed - onchain) / onchain.
 */
export function reconstructionError(points: RewardPoint[], accRewardPerShareRaw: bigint): number {
  const reconstructed = points.reduce((s, p) => s + p.rewardPerPaper, 0);
  const onchain = Number(accRewardPerShareRaw) / 1e27;
  return onchain > 0 ? (reconstructed - onchain) / onchain : 0;
}
