/**
 * "Possibly sold", per source. Pure functions; the run lookup lives in market.ts.
 *
 * A listing unseen for RUNS_BEFORE_POSSIBLY_SOLD runs is treated as possibly sold.
 * The runs counted are the ones that crawled the listing's own source: a run that
 * left a source out (it was not selected, or its adapter failed) says nothing about
 * that source's listings, so it must not push them toward sold.
 */

import type { Prisma } from './generated/prisma/client';
import { SOURCE_IDS, type SourceId } from './listing-card';

/**
 * Runs rather than days, because the thing being tolerated is a missed run — a
 * blocked night, a machine asleep — and that is counted in runs. Changing this is
 * changing a constant; nothing is stored that depends on it.
 */
export const RUNS_BEFORE_POSSIBLY_SOLD = 3;

/** Per source, listings last seen before this moment are possibly sold. */
export type PossiblySoldCutoffs = Partial<Record<SourceId, Date>>;

export interface FinishedRun {
  startedAt: Date;
  sources: string[];
}

/** Sources a scraper crawls. Manual listings leave only through `removedAt`. */
const SCRAPED_SOURCES = SOURCE_IDS.filter((id) => id !== 'manual');

/**
 * Each source's cutoff: the start of its 3rd newest finished run.
 *
 * `runs` are SUCCESS or PARTIAL runs. Runs from before `sources` existed have it
 * empty, and they were Urbania runs. A source with fewer runs than that has no
 * cutoff, so nothing of it is possibly sold, which is the right answer on day one.
 */
export function cutoffsFromRuns(runs: FinishedRun[]): PossiblySoldCutoffs {
  const newestFirst = [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const cutoffs: PossiblySoldCutoffs = {};

  for (const source of SCRAPED_SOURCES) {
    const covering = newestFirst.filter(
      (run) => run.sources.includes(source) || (source === 'urbania' && run.sources.length === 0)
    );
    if (covering.length >= RUNS_BEFORE_POSSIBLY_SOLD) {
      cutoffs[source] = covering[RUNS_BEFORE_POSSIBLY_SOLD - 1].startedAt;
    }
  }
  return cutoffs;
}

export interface PostingLiveness {
  source: string;
  lastSeenAt: Date;
  removedAt: Date | null;
}

function cutoffFor(source: string, cutoffs: PossiblySoldCutoffs): Date | undefined {
  return (SOURCE_IDS as readonly string[]).includes(source) ? cutoffs[source as SourceId] : undefined;
}

/** Unseen by its own source for too many runs. A removed posting is removed, not sold. */
export function isPossiblySold(posting: PostingLiveness, cutoffs: PossiblySoldCutoffs): boolean {
  if (posting.removedAt) return false;
  const cutoff = cutoffFor(posting.source, cutoffs);
  return cutoff != null && posting.lastSeenAt < cutoff;
}

/** On the market as far as anyone can tell: not removed and not possibly sold. */
export function isLivePosting(posting: PostingLiveness, cutoffs: PossiblySoldCutoffs): boolean {
  return !posting.removedAt && !isPossiblySold(posting, cutoffs);
}

function cutoffEntries(cutoffs: PossiblySoldCutoffs): [SourceId, Date][] {
  return Object.entries(cutoffs).filter((entry): entry is [SourceId, Date] => entry[1] != null);
}

/**
 * The Prisma filter matching `isLivePosting`.
 *
 * It carries its own `OR`, so callers that have one too put it under `AND`.
 */
export function livePostingWhere(cutoffs: PossiblySoldCutoffs): Prisma.PostingWhereInput {
  const entries = cutoffEntries(cutoffs);
  if (entries.length === 0) return { removedAt: null };
  return {
    removedAt: null,
    OR: [
      ...entries.map(([source, cutoff]) => ({ source, lastSeenAt: { gte: cutoff } })),
      { source: { notIn: entries.map(([source]) => source) } },
    ],
  };
}

/** The Prisma filter for everything `livePostingWhere` leaves out: gone from the market. */
export function notLivePostingWhere(cutoffs: PossiblySoldCutoffs): Prisma.PostingWhereInput {
  return {
    OR: [
      { removedAt: { not: null } },
      ...cutoffEntries(cutoffs).map(([source, cutoff]) => ({ source, lastSeenAt: { lt: cutoff } })),
    ],
  };
}
