import type { StakingEvent } from './events.js';

export interface ClaimBucket {
  /** Hour start, unix ms. */
  t: number;
  claimedUsd: number;
  claims: number;
}

export interface ClaimsSummary {
  hours: number;
  totalClaimedUsd: number;
  claims: number;
  uniqueClaimers: number;
  largestClaimUsd: number;
  buckets: ClaimBucket[];
}

/** Bucket Claimed events (USDC wad) per UTC hour over the trailing `hours`. Events without a timestamp are skipped. */
export function aggregateClaims(events: StakingEvent[], options: { nowMs: number; hours: number }): ClaimsSummary {
  const hourMs = 3_600_000;
  const end = Math.floor(options.nowMs / hourMs) * hourMs + hourMs;
  const start = end - options.hours * hourMs;
  const buckets: ClaimBucket[] = Array.from({ length: options.hours }, (_, i) => ({ t: start + i * hourMs, claimedUsd: 0, claims: 0 }));
  const claimers = new Set<string>();
  let totalWad = 0n;
  let largestWad = 0n;
  let claims = 0;
  for (const e of events) {
    if (e.kind !== 'Claimed' || e.timestamp === null) continue;
    const ms = e.timestamp * 1000;
    if (ms < start || ms >= end) continue;
    const bucket = buckets[Math.floor((ms - start) / hourMs)];
    bucket.claimedUsd += Number(e.amountRaw) / 1e18;
    bucket.claims += 1;
    claimers.add(e.user);
    totalWad += e.amountRaw;
    if (e.amountRaw > largestWad) largestWad = e.amountRaw;
    claims += 1;
  }
  return {
    hours: options.hours,
    totalClaimedUsd: Number(totalWad) / 1e18,
    claims,
    uniqueClaimers: claimers.size,
    largestClaimUsd: Number(largestWad) / 1e18,
    buckets,
  };
}
