/**
 * The contract every listing source implements.
 *
 * An adapter crawls; it never touches the database. The scrape loop owns the raw
 * NDJSON copy, the sanity gate and the ingest, so every source gets the same
 * protection against a broken parser marking its listings as sold.
 */

import type { Operation } from '@/lib/generated/prisma/enums';
import type { ListingCard, SourceId } from '@/lib/listing-card';

/** Cards observed for one district, handed over as soon as they are parsed. */
export interface SourceBatch {
  districtSlug: string;
  cards: ListingCard[];
}

/** Health of one district's crawl, recorded on the run. */
export interface SourceDistrictResult {
  districtSlug: string;
  pagesFetched: number;
  /** True when a page came back blocked rather than empty. */
  blocked: boolean;
  errors: string[];
  /** What the source claimed the district holds, when it says. */
  claimedTotal: number | null;
}

export interface SourceCrawlResult {
  districts: SourceDistrictResult[];
  /** Cards dropped because they were not in a Lima district. */
  skippedOutsideLima: number;
  /**
   * True when the crawl stopped before covering every requested district. The
   * finished districts still ingest, but the source counts as failed on the run.
   */
  incomplete: boolean;
}

export interface SourceAdapter {
  id: SourceId;
  operations: Operation[];
  /**
   * Crawl these districts for one operation. Every card of a district must reach
   * `onBatch` before that district appears in the result. Throwing means the
   * source failed as a whole; the loop records it and moves to the next source.
   */
  crawl(opts: {
    districts: string[];
    operation: Operation;
    onBatch: (b: SourceBatch) => Promise<void>;
  }): Promise<SourceCrawlResult>;
}
