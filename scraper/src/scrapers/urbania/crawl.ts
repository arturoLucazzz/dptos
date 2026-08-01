/**
 * Crawl one district's listings, splitting the search into price bands.
 *
 * Why bands rather than plain pagination: paging through 40 pages of a district
 * takes around 25 minutes, and the result set is sorted live. If one cheap
 * apartment sells during those 25 minutes, every listing after it shifts one
 * position up, and the listings that were at the top of page 31 move to the
 * bottom of page 30, which was already downloaded. They are never seen. Sorting
 * by price ascending and slicing the district into price bands keeps every query
 * to a handful of pages, and nothing sells inside a one-minute window.
 *
 * The band boundaries are found from the data rather than hardcoded: the cheapest
 * and most expensive listing in the district are read off the first page of an
 * ascending and a descending search, and the range between them is bisected
 * until each query fits in the page budget.
 */

import retry from 'async-retry';
import { buildUrbaniaSearchUrl } from './build-search-url';
import { parseUrbaniaSearchPage } from './parse-urbania-page';
import { classifyPage } from './classify-page';
import type { UrbaniaCardRaw, UrbaniaPageParse } from './types';
import type { BrowserLoader } from '../../utils/browser-loader';
import type { ScraperFilters } from '../../types/index';
import { toPen } from '@/lib/money';

/** Pages a single query is allowed to need before it gets split into bands. */
const MAX_PAGES_PER_BAND = Number(process.env.MAX_PAGES_PER_BAND) || 8;
/** How deep the bisection can go before accepting an oversized band. */
const MAX_BAND_DEPTH = Number(process.env.MAX_BAND_DEPTH) || 8;
/** Bands narrower than this are not worth splitting further. */
const MIN_BAND_WIDTH_PEN = 5_000;
const RETRIES = Number(process.env.PAGE_RETRIES) || 3;

export interface PriceBand {
  /** Inclusive lower bound in soles, or null for "no lower bound". */
  min: number | null;
  /** Inclusive upper bound in soles, or null for "no upper bound". */
  max: number | null;
}

export interface CrawlBatch {
  districtSlug: string;
  band: PriceBand;
  page: number;
  cards: UrbaniaCardRaw[];
  /** Total the site claims for this band, for reconciliation. */
  bandTotal: number | null;
}

export interface CrawlError {
  districtSlug: string;
  band: PriceBand;
  page: number;
  url: string;
  message: string;
  /** True when the failure looked like blocking rather than an empty result. */
  blocked: boolean;
}

export interface DistrictCrawlResult {
  districtSlug: string;
  /** Distinct postings collected. */
  cardCount: number;
  /** What the site claimed the district holds, before banding. */
  claimedTotal: number | null;
  pagesFetched: number;
  bands: PriceBand[];
  errors: CrawlError[];
  /** True when at least one page came back as blocked rather than empty. */
  blocked: boolean;
}

export interface CrawlOptions {
  loader: BrowserLoader;
  baseUrl: string;
  filters: ScraperFilters;
  districtSlug: string;
  /** Called after every page so a long run can be resumed instead of lost. */
  onBatch: (batch: CrawlBatch) => Promise<void>;
  /** Pause between page loads. */
  wait: () => Promise<void>;
  log?: (message: string) => void;
}

function describeBand(band: PriceBand): string {
  if (band.min == null && band.max == null) return 'all prices';
  return `${band.min?.toLocaleString() ?? '0'}..${band.max?.toLocaleString() ?? '∞'}`;
}

/** Bisect geometrically, since asking prices are spread on a log scale. */
function splitPoint(min: number, max: number): number {
  return Math.round(Math.sqrt(Math.max(min, 1) * max));
}

class BlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedError';
  }
}

export async function crawlDistrict(options: CrawlOptions): Promise<DistrictCrawlResult> {
  const { loader, baseUrl, filters, districtSlug, onBatch, wait } = options;
  const log = options.log ?? (() => {});

  const seenIds = new Set<string>();
  const errors: CrawlError[] = [];
  const bands: PriceBand[] = [];
  let pagesFetched = 0;
  let claimedTotal: number | null = null;
  let blocked = false;

  /** Load one page of a band, retrying with exponential backoff. */
  async function loadPage(band: PriceBand, page: number): Promise<UrbaniaPageParse | null> {
    const url = buildUrbaniaSearchUrl(
      { ...filters, district: districtSlug, districts: undefined, sort: 'priceAsc', minPrice: band.min ?? undefined, maxPrice: band.max ?? undefined },
      page
    );

    try {
      return await retry(
        async () => {
          await wait();
          const { html, status } = await loader.load(url);
          pagesFetched++;
          const parse = parseUrbaniaSearchPage(html, baseUrl);
          const outcome = classifyPage({ status, html, parse });
          if (outcome.kind === 'BLOCKED') {
            // Retrying is worthwhile: challenges are often transient.
            throw new BlockedError(outcome.reason);
          }
          return parse;
        },
        {
          retries: RETRIES,
          factor: 2,
          minTimeout: 5_000,
          maxTimeout: 60_000,
          onRetry: (error: Error, attempt: number) => {
            log(`  retry ${attempt} for ${districtSlug} ${describeBand(band)} page ${page}: ${error.message}`);
          },
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isBlock = error instanceof BlockedError || error?.constructor?.name === 'BlockedError';
      if (isBlock) blocked = true;
      errors.push({ districtSlug, band, page, url, message, blocked: isBlock });
      log(`  FAILED ${districtSlug} ${describeBand(band)} page ${page}: ${message}`);
      return null;
    }
  }

  /** Emit a page's new cards, skipping ones already seen in another band. */
  async function emit(band: PriceBand, page: number, parse: UrbaniaPageParse): Promise<void> {
    const fresh: UrbaniaCardRaw[] = [];
    for (const card of parse.cards) {
      const id = card.sourcePostingId;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      fresh.push(card);
    }
    if (fresh.length === 0) return;
    await onBatch({ districtSlug, band, page, cards: fresh, bandTotal: parse.totalResults });
  }

  function unitPricesPen(parse: UrbaniaPageParse): number[] {
    return parse.cards
      .map((card) => toPen(card.priceAmount, card.priceCurrency))
      .filter((p): p is number => p != null);
  }

  /** Highest asking price in the district, used as the top of the band range. */
  async function findMaxPrice(): Promise<number | null> {
    const url = buildUrbaniaSearchUrl(
      { ...filters, district: districtSlug, districts: undefined, sort: 'priceDesc' },
      1
    );
    try {
      await wait();
      const { html, status } = await loader.load(url);
      pagesFetched++;
      const parse = parseUrbaniaSearchPage(html, baseUrl);
      if (classifyPage({ status, html, parse }).kind === 'BLOCKED') return null;
      const prices = unitPricesPen(parse);
      return prices.length ? Math.max(...prices) : null;
    } catch {
      return null;
    }
  }

  /**
   * Crawl a band, splitting it when the site reports more results than the page
   * budget allows. The first page is fetched before the decision, so the request
   * that measures the band is also the one that collects its first page.
   */
  async function crawlBand(band: PriceBand, depth: number): Promise<void> {
    const first = await loadPage(band, 1);
    if (!first) return;

    const total = first.totalResults;
    const pageSize = first.pageSize ?? first.cards.length ?? 30;
    const budget = pageSize * MAX_PAGES_PER_BAND;

    const canSplit =
      total != null &&
      total > budget &&
      depth < MAX_BAND_DEPTH &&
      band.max != null &&
      band.max - (band.min ?? 0) > MIN_BAND_WIDTH_PEN;

    if (canSplit) {
      const min = band.min ?? 0;
      const mid = splitPoint(min, band.max!);
      // Only split when the midpoint actually divides the range, otherwise the
      // recursion would repeat the same band forever.
      if (mid > min && mid < band.max!) {
        log(`  ${districtSlug} ${describeBand(band)} has ${total} results, splitting at ${mid.toLocaleString()}`);
        await crawlBand({ min: band.min, max: mid }, depth + 1);
        await crawlBand({ min: mid + 1, max: band.max }, depth + 1);
        return;
      }
    }

    bands.push(band);
    await emit(band, 1, first);

    const pageCount =
      total != null && pageSize > 0
        ? Math.min(Math.ceil(total / pageSize), first.totalPages ?? Number.MAX_SAFE_INTEGER)
        : first.totalPages ?? 1;

    log(
      `  ${districtSlug} ${describeBand(band)}: ${total ?? '?'} results over ${pageCount} page(s) via ${first.source}`
    );

    for (let page = 2; page <= pageCount; page++) {
      const parse = await loadPage(band, page);
      if (!parse) continue;
      if (parse.cards.length === 0) break;
      await emit(band, page, parse);
    }
  }

  // Probe the district once without a band. When it fits the budget this is the
  // whole crawl and no extra request was spent on finding the price range.
  const probe = await loadPage({ min: null, max: null }, 1);
  if (!probe) {
    return { districtSlug, cardCount: 0, claimedTotal: null, pagesFetched, bands, errors, blocked };
  }

  claimedTotal = probe.totalResults;
  const pageSize = probe.pageSize ?? probe.cards.length ?? 30;
  const budget = pageSize * MAX_PAGES_PER_BAND;

  if (claimedTotal == null || claimedTotal <= budget) {
    bands.push({ min: null, max: null });
    await emit({ min: null, max: null }, 1, probe);
    const pageCount =
      claimedTotal != null ? Math.ceil(claimedTotal / pageSize) : probe.totalPages ?? 1;
    log(`${districtSlug}: ${claimedTotal ?? '?'} results over ${pageCount} page(s), no banding needed`);
    for (let page = 2; page <= pageCount; page++) {
      const parse = await loadPage({ min: null, max: null }, page);
      if (!parse) continue;
      if (parse.cards.length === 0) break;
      await emit({ min: null, max: null }, page, parse);
    }
  } else {
    const maxPrice = await findMaxPrice();
    // The probe was sorted ascending, so its cheapest card is the district floor.
    // Starting the bisection at zero instead wastes several requests on bands that
    // cannot contain anything.
    const probePrices = unitPricesPen(probe);
    const minPrice = probePrices.length ? Math.min(...probePrices) : null;
    log(
      `${districtSlug}: ${claimedTotal} results exceed the ${budget} budget, banding ` +
        `${minPrice?.toLocaleString() ?? '0'}..${maxPrice?.toLocaleString() ?? 'unknown'}`
    );
    // Without a ceiling there is nothing to bisect, so fall back to one band and
    // accept whatever the site is willing to paginate.
    await crawlBand({ min: minPrice, max: maxPrice }, 0);
    if (minPrice != null) {
      // Anything the ascending probe could not have shown, in case a cheaper
      // listing appears mid-run.
      await crawlBand({ min: null, max: minPrice - 1 }, MAX_BAND_DEPTH);
    }
    if (maxPrice != null) {
      await crawlBand({ min: maxPrice + 1, max: null }, MAX_BAND_DEPTH);
    }
  }

  return {
    districtSlug,
    cardCount: seenIds.size,
    claimedTotal,
    pagesFetched,
    bands,
    errors,
    blocked,
  };
}
