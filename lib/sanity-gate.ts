/**
 * The per-source sanity gate. Pure functions; the database lookup lives in the
 * scraper's ingest.
 *
 * A source that returns far fewer listings than its last run for a district is
 * treated as broken, not empty, so its listings there keep their `lastSeenAt`.
 */

import { SOURCE_IDS, type SourceId } from './listing-card';

/** Run counts per source, district and operation: { urbania: { lince: { SALE: 281 } } }. */
export type SourceDistrictCounts = Record<string, Record<string, Partial<Record<'SALE' | 'RENT', number>>>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The count a previous run recorded for one source, district and operation.
 *
 * Runs from before there was more than one source stored `{ district: {...} }`.
 * No district slug is a source id, so a top level without any source id is that
 * old shape, and it counts as `urbania` only.
 */
export function previousCountFrom(
  counts: unknown,
  source: SourceId,
  district: string,
  operation: 'SALE' | 'RENT'
): number | null {
  if (!isRecord(counts)) return null;

  const isNewShape = Object.keys(counts).some((key) => (SOURCE_IDS as readonly string[]).includes(key));
  const byDistrict = isNewShape ? counts[source] : source === 'urbania' ? counts : null;
  if (!isRecord(byDistrict)) return null;

  const byOperation = byDistrict[district];
  if (!isRecord(byOperation)) return null;

  const value = byOperation[operation];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Whether the observed count collapsed below `ratio` of the previous one. */
export function gateSkips(observed: number, previous: number | null, ratio: number): boolean {
  return previous != null && previous > 0 && observed < previous * ratio;
}
