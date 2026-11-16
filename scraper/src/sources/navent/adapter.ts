/**
 * Urbania and Adondevivir as one source adapter, on Navent's JSON search API.
 *
 * Per district: open the district's search page (which sets the session up as a
 * visitor and gives the zone id), then page through `POST /rplis-api/postings`
 * until the page count the API reports. Cards are handed over page by page.
 *
 * When the JSON path fails for an Urbania district, the existing HTML crawler
 * crawls that district instead. Cards the JSON path already handed over are not
 * handed over twice. Adondevivir has no HTML crawler, so its failures are
 * recorded on the district, as the HTML crawler does for a page that fails.
 */

import retry from 'async-retry';
import { Operation } from '@/lib/generated/prisma/enums';
import type { ListingCard } from '@/lib/listing-card';
import { RateLimiter } from '../../utils/anti-blocking';
import { createBrowserSession, HttpStatusError, type BrowserSession } from '../../utils/browser-fetch';
import type { SourceAdapter, SourceBatch, SourceCrawlResult, SourceDistrictResult } from '../types';
import { createUrbaniaAdapter } from '../urbania';
import { fetchPostingsPage, NAVENT_BASE_URL, naventSearchUrl, zoneFromSearchPage, type NaventSite } from './client';
import { parseNaventPostings } from './parse';

/** What the adapter reaches outside itself for, replaceable in tests. */
export interface NaventAdapterDeps {
  createSession: (originUrl: string) => Promise<BrowserSession>;
  /** The Urbania HTML crawler, used when the JSON path fails. */
  htmlCrawl: SourceAdapter['crawl'];
  /** Pause before every request. */
  wait: () => Promise<void>;
  /** Retries per page before the JSON path counts as failed. */
  retries: number;
  log: (message: string) => void;
}

function defaultDeps(): NaventAdapterDeps {
  // Same pace as the HTML crawler, one request at a time.
  const limiter = new RateLimiter(1500, 3000);
  return {
    createSession: createBrowserSession,
    htmlCrawl: (opts) => createUrbaniaAdapter().crawl(opts),
    wait: () => limiter.wait(),
    retries: Number(process.env.PAGE_RETRIES) || 3,
    log: (message) => console.log(message),
  };
}

/** The district could not be crawled through the JSON path. */
class JsonPathError extends Error {
  constructor(
    message: string,
    public readonly blocked: boolean
  ) {
    super(message);
    this.name = 'JsonPathError';
  }
}

/** The browser is gone, so nothing after this can be crawled with it. */
function isBrowserGone(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Target (page, context or browser )?(has been )?closed|browser has been closed|Browser closed/i.test(message);
}

function looksBlocked(error: unknown): boolean {
  return error instanceof HttpStatusError && (error.status === 403 || error.status === 429);
}

interface DistrictCrawl {
  result: SourceDistrictResult;
  /** Ids handed over to `onBatch`, so a fallback can skip them. */
  emitted: Set<string>;
  /** Set when the JSON path did not cover the district. */
  failure: JsonPathError | null;
}

async function crawlDistrictJson(opts: {
  session: BrowserSession;
  site: NaventSite;
  districtSlug: string;
  operation: Operation;
  wait: () => Promise<void>;
  retries: number;
  log: (message: string) => void;
  onBatch: (b: SourceBatch) => Promise<void>;
}): Promise<DistrictCrawl> {
  const { session, site, districtSlug, operation, wait, retries, log, onBatch } = opts;
  const baseUrl = NAVENT_BASE_URL[site];
  const result: SourceDistrictResult = { districtSlug, pagesFetched: 0, blocked: false, errors: [], claimedTotal: null };
  const emitted = new Set<string>();

  const fail = (failure: JsonPathError): DistrictCrawl => {
    log(`${site} ${districtSlug}: FAILED ${failure.message}`);
    result.errors.push(failure.message);
    if (failure.blocked) result.blocked = true;
    return { result, emitted, failure };
  };

  const searchUrl = naventSearchUrl(site, districtSlug, operation);
  await wait();
  let opened;
  try {
    opened = await session.open(searchUrl);
  } catch (error) {
    if (isBrowserGone(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return fail(new JsonPathError(`${districtSlug}: could not open ${searchUrl}: ${message}`, false));
  }
  result.pagesFetched++;
  const zone = opened.status != null && opened.status < 400 ? zoneFromSearchPage(opened.html, districtSlug) : null;
  if (!zone) {
    return fail(
      new JsonPathError(
        `${districtSlug}: no zone id on ${searchUrl} (HTTP ${opened.status ?? '?'})`,
        opened.status === 403 || opened.status === 429
      )
    );
  }

  async function loadPage(page: number): Promise<{ cards: ListingCard[]; totalPages: number | null; totalResults: number | null }> {
    return retry(
      async (bail) => {
        await wait();
        let json: unknown;
        try {
          json = await fetchPostingsPage(session, site, zone!, operation, page);
        } catch (error) {
          if (isBrowserGone(error)) bail(error as Error);
          throw error;
        }
        result.pagesFetched++;
        const parsed = parseNaventPostings(json, baseUrl, site, districtSlug);
        if (parsed.totalResults == null && parsed.cards.length === 0) {
          throw new Error(`page ${page} is not a results page`);
        }
        return parsed;
      },
      { retries, factor: 2, minTimeout: 5_000, maxTimeout: 60_000 }
    );
  }

  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    let parsed;
    try {
      parsed = await loadPage(page);
    } catch (error) {
      if (isBrowserGone(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      return fail(new JsonPathError(`${districtSlug} page ${page}: ${message}`, looksBlocked(error)));
    }

    if (page === 1) {
      result.claimedTotal = parsed.totalResults;
      totalPages = parsed.totalPages ?? 1;
      log(`${site} ${districtSlug}: ${parsed.totalResults ?? '?'} results over ${totalPages} page(s) via JSON`);
    }
    if (parsed.cards.length === 0) break;

    const fresh = parsed.cards.filter((card) => {
      const id = card.sourcePostingId;
      if (!id || emitted.has(id)) return false;
      emitted.add(id);
      return true;
    });
    if (fresh.length > 0) await onBatch({ districtSlug, cards: fresh });
  }

  log(`${site} ${districtSlug}: ${emitted.size} postings, ${result.pagesFetched} requests`);
  return { result, emitted, failure: null };
}

/** Crawl one Urbania district with the HTML crawler, skipping cards already handed over. */
async function urbaniaHtmlFallback(
  htmlCrawl: SourceAdapter['crawl'],
  districtSlug: string,
  operation: Operation,
  already: Set<string>,
  onBatch: (b: SourceBatch) => Promise<void>
): Promise<SourceCrawlResult> {
  return htmlCrawl({
    districts: [districtSlug],
    operation,
    onBatch: async (batch) => {
      const fresh = batch.cards.filter((card) => !card.sourcePostingId || !already.has(card.sourcePostingId));
      if (fresh.length > 0) await onBatch({ ...batch, cards: fresh });
    },
  });
}

export function naventAdapter(site: NaventSite, overrides: Partial<NaventAdapterDeps> = {}): SourceAdapter {
  return {
    id: site,
    operations: [Operation.SALE, Operation.RENT],

    async crawl({ districts, operation, onBatch }) {
      const deps = { ...defaultDeps(), ...overrides };
      const results: SourceDistrictResult[] = [];
      let incomplete = false;

      let session: BrowserSession;
      try {
        session = await deps.createSession(NAVENT_BASE_URL[site]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (site !== 'urbania') throw error;
        deps.log(`urbania: JSON session failed (${message}); crawling with the HTML crawler`);
        return deps.htmlCrawl({ districts, operation, onBatch });
      }

      try {
        for (const districtSlug of districts) {
          let crawl: DistrictCrawl;
          try {
            crawl = await crawlDistrictJson({
              session,
              site,
              districtSlug,
              operation,
              wait: deps.wait,
              retries: deps.retries,
              log: deps.log,
              onBatch,
            });
          } catch (error) {
            // The browser died. The districts finished so far stand; the rest
            // are not crawled, so the source counts as failed on the run.
            const message = error instanceof Error ? error.message : String(error);
            deps.log(`${site}: crawl stopped early at ${districtSlug}: ${message}`);
            const last = results[results.length - 1];
            if (!last) throw error;
            last.errors.push(`crawl stopped early at ${districtSlug}: ${message}`);
            incomplete = true;
            break;
          }

          if (!crawl.failure || site !== 'urbania') {
            results.push(crawl.result);
            continue;
          }

          deps.log(`urbania ${districtSlug}: JSON path failed (${crawl.failure.message}); falling back to HTML`);
          try {
            const fallback = await urbaniaHtmlFallback(deps.htmlCrawl, districtSlug, operation, crawl.emitted, onBatch);
            if (fallback.incomplete) incomplete = true;
            const html = fallback.districts.find((d) => d.districtSlug === districtSlug);
            if (!html) {
              // Left out of the result, which fails the source.
              incomplete = true;
              continue;
            }
            results.push({
              districtSlug,
              pagesFetched: crawl.result.pagesFetched + html.pagesFetched,
              blocked: crawl.result.blocked || html.blocked,
              errors: [`JSON path: ${crawl.failure.message}`, ...html.errors],
              claimedTotal: html.claimedTotal ?? crawl.result.claimedTotal,
            });
          } catch (error) {
            // The HTML crawler could not start at all. The district is left out
            // of the result, which fails the source, and the rest still run.
            const message = error instanceof Error ? error.message : String(error);
            deps.log(`urbania ${districtSlug}: HTML fallback failed too: ${message}`);
            incomplete = true;
          }
        }
      } finally {
        await session.close();
      }

      return { districts: results, skippedOutsideLima: 0, incomplete };
    },
  };
}
