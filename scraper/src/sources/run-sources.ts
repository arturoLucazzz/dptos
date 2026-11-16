/**
 * Which sources a finished run records in `sources`.
 *
 * A run listed under a source counts toward marking that source's listings as
 * possibly sold, and becomes that source's baseline for the next sanity gate.
 * So a source is recorded only when this run is a trustworthy observation of
 * it: it crawled, nothing failed, and the gate did not trip on any district.
 * Its counts are still kept in `districtCounts`.
 */

import type { SourceId } from '@/lib/listing-card';

export interface SourceOutcome {
  source: SourceId;
  /** At least one operation was crawled. */
  crawled: boolean;
  /** At least one operation threw. */
  failed: boolean;
  /** District and operation slices the sanity gate skipped. */
  gatedSlices: number;
}

export type LeftOutReason = 'failed' | 'sanity gate' | 'nothing crawled';

export function sourcesToRecord(outcomes: SourceOutcome[]): {
  recorded: SourceId[];
  leftOut: { source: SourceId; reason: LeftOutReason }[];
} {
  const recorded: SourceId[] = [];
  const leftOut: { source: SourceId; reason: LeftOutReason }[] = [];
  for (const outcome of outcomes) {
    if (outcome.failed) leftOut.push({ source: outcome.source, reason: 'failed' });
    else if (outcome.gatedSlices > 0) leftOut.push({ source: outcome.source, reason: 'sanity gate' });
    else if (!outcome.crawled) leftOut.push({ source: outcome.source, reason: 'nothing crawled' });
    else recorded.push(outcome.source);
  }
  return { recorded, leftOut };
}
