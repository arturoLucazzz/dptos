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
import type { SourceCrawlResult } from './types';

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

/** The slug a scraper builds from a typed district name. */
function districtSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Whether a crawl covered everything it was asked for. One that stopped early,
 * left a requested district out, or came back blocked or with errors for a
 * requested district, is a failed source: its cards still ingest, but the run
 * does not record the source, so it ages none of its listings.
 */
export function crawlIsComplete(requested: string[], result: SourceCrawlResult): boolean {
  if (result.incomplete) return false;
  const returned = new Map(result.districts.map((d) => [districtSlug(d.districtSlug), d]));
  return requested.every((name) => {
    const district = returned.get(districtSlug(name));
    return district != null && !district.blocked && district.errors.length === 0;
  });
}

/**
 * `--accept-gate=source:district`, repeated or as a comma list: slices whose
 * collapse the owner has checked and accepts for this run, both operations.
 */
export function parseAcceptGate(args: string[]): Set<string> {
  const prefix = '--accept-gate=';
  const accepted = new Set<string>();
  for (const arg of args) {
    if (!arg.startsWith(prefix)) continue;
    for (const value of arg.slice(prefix.length).split(',')) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const [source, district, ...rest] = trimmed.split(':');
      if (!source || !district || rest.length > 0) {
        throw new Error(`--accept-gate expects source:district, got "${trimmed}"`);
      }
      accepted.add(`${source}:${districtSlug(district)}`);
    }
  }
  return accepted;
}
