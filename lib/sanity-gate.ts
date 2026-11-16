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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether stored run counts use the per-source shape. No district slug is a
 * source id, so a top level with a source id is the new shape; without one it is
 * the old `{ district: {...} }` shape.
 */
export function isPerSourceShape(counts: unknown): counts is Record<string, unknown> {
  return isRecord(counts) && Object.keys(counts).some((key) => (SOURCE_IDS as readonly string[]).includes(key));
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

  const isNewShape = isPerSourceShape(counts);
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

/** How many collapsed runs in a row, the current one included, make a drop real. */
export const RUNS_TO_ACCEPT_DROP = 3;

/** One earlier run's view of a source, district and operation. */
export interface SliceObservation {
  observed: number;
  gated: boolean;
}

/**
 * The runs that observed one slice, newest first, from what runs store:
 * `districtCounts` and `skippedDistricts`. Gated runs are not in the source's
 * `sources`, so this reads the counts instead. Old Urbania runs wrote skipped
 * slices as `district:OP`.
 */
export function sliceHistory(
  runsNewestFirst: { districtCounts: unknown; skippedDistricts: string[] }[],
  source: SourceId,
  district: string,
  operation: 'SALE' | 'RENT'
): SliceObservation[] {
  const keys = [`${source}:${district}:${operation}`];
  if (source === 'urbania') keys.push(`${district}:${operation}`);

  const history: SliceObservation[] = [];
  for (const run of runsNewestFirst) {
    const observed = previousCountFrom(run.districtCounts, source, district, operation);
    if (observed == null) continue;
    history.push({ observed, gated: run.skippedDistricts.some((slice) => keys.includes(slice)) });
  }
  return history;
}

export type GateVerdict = 'pass' | 'skip' | 'auto-accepted' | 'manual-accepted';

/**
 * The gate, with two ways out of a drop that is real (a district relabelled, a
 * bulk delisting), so the baseline does not stay stuck at the old count forever:
 *
 * - automatic, when the slice collapsed in RUNS_TO_ACCEPT_DROP runs in a row,
 *   this one included, with something observed each time. Zero is never
 *   accepted on its own: a blocked source must not mark everything sold.
 * - manual, with `--accept-gate=source:district` for this run.
 *
 * `recent` is the slice's earlier history, newest first.
 */
export function gateVerdict(input: {
  observed: number;
  previousCount: number | null;
  ratio: number;
  recent: SliceObservation[];
  manualAccept: boolean;
}): GateVerdict {
  if (!gateSkips(input.observed, input.previousCount, input.ratio)) return 'pass';
  if (input.manualAccept) return 'manual-accepted';

  const earlier = input.recent.slice(0, RUNS_TO_ACCEPT_DROP - 1);
  const collapsedEveryTime =
    input.observed > 0 &&
    earlier.length === RUNS_TO_ACCEPT_DROP - 1 &&
    earlier.every((run) => run.gated && run.observed > 0);
  return collapsedEveryTime ? 'auto-accepted' : 'skip';
}
