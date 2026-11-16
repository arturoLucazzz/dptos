/**
 * "Possibly sold", per source. Pure functions; the run lookup lives in market.ts.
 *
 * A listing unseen for RUNS_BEFORE_POSSIBLY_SOLD runs is treated as possibly sold.
 * The runs counted are the ones that crawled the listing's own slice: its source,
 * district and operation. A run that left any of those out (the source was not
 * selected or failed, the district was not asked for, a sale-only run) says
 * nothing about that listing, so it must not push it toward sold.
 */

import type { Prisma } from './generated/prisma/client';
import { SOURCE_IDS } from './listing-card';
import { countedDistricts, previousCountFrom, recordedSources } from './sanity-gate';

/**
 * Runs rather than days, because the thing being tolerated is a missed run — a
 * blocked night, a machine asleep — and that is counted in runs. Changing this is
 * changing a constant; nothing is stored that depends on it.
 */
export const RUNS_BEFORE_POSSIBLY_SOLD = 3;

type OperationKey = 'SALE' | 'RENT';
const OPERATIONS: OperationKey[] = ['SALE', 'RENT'];

/**
 * Per slice (source, district, operation), listings last seen before this
 * moment are possibly sold. Keyed by `sliceKey`.
 */
export type PossiblySoldCutoffs = Map<string, Date>;

export function sliceKey(source: string, districtSlug: string, operation: string): string {
  return `${source}|${districtSlug}|${operation}`;
}

function parseSliceKey(key: string): { source: string; districtSlug: string; operation: string } {
  const [source, districtSlug, operation] = key.split('|');
  return { source, districtSlug, operation };
}

export interface FinishedRun {
  startedAt: Date;
  sources: string[];
  districtCounts: unknown;
}

/** Sources a scraper crawls. Manual listings leave only through `removedAt`. */
const SCRAPED_SOURCES: readonly string[] = SOURCE_IDS.filter((id) => id !== 'manual');

/**
 * The slices a run looked at: each source it recorded, each district and
 * operation it has a count for under that source. A daily run of ten districts
 * says nothing about the others, and a run that left a source out (failed,
 * gated, not selected, a replay) says nothing about that source.
 */
export function coveredSlices(run: { sources: string[]; districtCounts: unknown }): string[] {
  const slices: string[] = [];
  for (const source of recordedSources(run.districtCounts, run.sources)) {
    if (!SCRAPED_SOURCES.includes(source)) continue;
    for (const district of countedDistricts(run.districtCounts, source)) {
      for (const operation of OPERATIONS) {
        if (previousCountFrom(run.districtCounts, source, district, operation) != null) {
          slices.push(sliceKey(source, district, operation));
        }
      }
    }
  }
  return slices;
}

/**
 * Each slice's cutoff: the start of the 3rd newest finished run that covered it.
 *
 * `runs` are SUCCESS or PARTIAL runs. Runs from before `sources` existed have it
 * empty and flat counts, and they were Urbania runs. A slice with fewer runs
 * than that has no cutoff, so nothing in it is possibly sold, which is the right
 * answer on day one.
 */
export function cutoffsFromRuns(runs: FinishedRun[]): PossiblySoldCutoffs {
  const newestFirst = [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const seen = new Map<string, number>();
  const cutoffs: PossiblySoldCutoffs = new Map();

  for (const run of newestFirst) {
    for (const slice of new Set(coveredSlices(run))) {
      const count = (seen.get(slice) ?? 0) + 1;
      seen.set(slice, count);
      if (count === RUNS_BEFORE_POSSIBLY_SOLD) cutoffs.set(slice, run.startedAt);
    }
  }
  return cutoffs;
}

export interface PostingLiveness {
  source: string;
  districtSlug: string;
  operation: string;
  lastSeenAt: Date;
  removedAt: Date | null;
}

/** Unseen by runs covering its own slice for too many runs. A removed posting is removed, not sold. */
export function isPossiblySold(posting: PostingLiveness, cutoffs: PossiblySoldCutoffs): boolean {
  if (posting.removedAt) return false;
  const cutoff = cutoffs.get(sliceKey(posting.source, posting.districtSlug, posting.operation));
  return cutoff != null && posting.lastSeenAt < cutoff;
}

/** On the market as far as anyone can tell: not removed and not possibly sold. */
export function isLivePosting(posting: PostingLiveness, cutoffs: PossiblySoldCutoffs): boolean {
  return !posting.removedAt && !isPossiblySold(posting, cutoffs);
}

interface CutoffGroup {
  source: string;
  operation: string;
  cutoff: Date;
  districts: string[];
}

/**
 * Slices grouped by source, operation and cutoff: most districts of a source
 * share their cutoff, so the filter stays a handful of branches.
 */
function cutoffGroups(cutoffs: PossiblySoldCutoffs): CutoffGroup[] {
  const groups = new Map<string, CutoffGroup>();
  for (const [key, cutoff] of [...cutoffs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const { source, districtSlug, operation } = parseSliceKey(key);
    const groupKey = `${source}|${operation}|${cutoff.getTime()}`;
    const group = groups.get(groupKey);
    if (group) group.districts.push(districtSlug);
    else groups.set(groupKey, { source, operation, cutoff, districts: [districtSlug] });
  }
  return [...groups.values()];
}

function sliceFilter(group: { source: string; operation: string; districts: string[] }) {
  return {
    source: group.source,
    operation: group.operation as OperationKey,
    districtSlug: { in: group.districts },
  };
}

/**
 * The Prisma filter matching `isLivePosting`.
 *
 * It carries its own `OR`, so callers that have one too put it under `AND`.
 */
export function livePostingWhere(cutoffs: PossiblySoldCutoffs): Prisma.PostingWhereInput {
  const groups = cutoffGroups(cutoffs);
  if (groups.length === 0) return { removedAt: null };
  return {
    removedAt: null,
    OR: [
      ...groups.map((group) => ({ ...sliceFilter(group), lastSeenAt: { gte: group.cutoff } })),
      // A slice without a cutoff: nothing in it is possibly sold.
      { NOT: { OR: groups.map(sliceFilter) } },
    ],
  };
}

/** The Prisma filter for everything `livePostingWhere` leaves out: gone from the market. */
export function notLivePostingWhere(cutoffs: PossiblySoldCutoffs): Prisma.PostingWhereInput {
  return {
    OR: [
      { removedAt: { not: null } },
      ...cutoffGroups(cutoffs).map((group) => ({ ...sliceFilter(group), lastSeenAt: { lt: group.cutoff } })),
    ],
  };
}
