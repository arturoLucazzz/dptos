/**
 * Nexo Inmobiliario (nexoinmobiliario.pe) as a source adapter.
 *
 * Findings, 2026-11-15:
 * - Paging is a plain GET: `/departamentos?page=N`, 24 projects per page, 780 in all
 *   (about 33 pages). Each page says its own `currentPage`, `totalProyectos` and
 *   `itemsPerPage`; the parser turns those into the next page URL.
 * - The server refuses (HTTP 403) requests that carry a browser User-Agent, and the
 *   project's own page, with or without one. A request with no User-Agent set (what
 *   curl and Node's fetch send) gets the list pages.
 * - Unit prices on a project page: unknown. The project page answered 403 to every
 *   plain request, so it could not be read. This plan reads projects only.
 *
 * The list covers all of Peru whatever district was asked for, so the `districts`
 * filter is ignored: each project goes out under its own district, and a requested
 * district without projects still gets an empty result so the run sees it covered.
 *
 * A page that cannot be fetched after retries, or that parses to no cards before the
 * last page, ends the crawl early and flags it incomplete.
 */

import retry from 'async-retry';
import { Operation } from '@/lib/generated/prisma/enums';
import type { ListingCard } from '@/lib/listing-card';
import { RateLimiter } from '../../utils/anti-blocking';
import type { SourceAdapter, SourceCrawlResult, SourceDistrictResult } from '../types';
import { NEXO_LIST_URL, parseNexoListPage } from './parse';

/** What the adapter reaches outside itself for, replaceable in tests. */
export interface NexoAdapterDeps {
  /** GET a URL and return the body text; throws on a non-2xx answer. */
  fetchText: (url: string) => Promise<string>;
  /** Pause before every request. */
  wait: () => Promise<void>;
  retries: number;
  log: (message: string) => void;
}

function defaultDeps(): NexoAdapterDeps {
  const limiter = new RateLimiter(1000, 3000);
  return {
    fetchText: async (url) => {
      const response = await fetch(url, {
        headers: { Accept: 'text/html' },
        // A stalled socket would otherwise hang the whole run.
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response.text();
    },
    wait: () => limiter.wait(),
    retries: Number(process.env.PAGE_RETRIES) || 3,
    log: (message) => console.log(message),
  };
}

export function nexoAdapter(overrides: Partial<NexoAdapterDeps> = {}): SourceAdapter {
  const deps = { ...defaultDeps(), ...overrides };
  const { wait, retries, log } = deps;

  const get = (url: string) =>
    retry(
      async () => {
        await wait();
        return deps.fetchText(url);
      },
      { retries, factor: 2, minTimeout: 5_000, maxTimeout: 60_000 }
    );

  return {
    id: 'nexo',
    operations: [Operation.SALE],
    async crawl({ districts, operation, onBatch }): Promise<SourceCrawlResult> {
      if (operation !== Operation.SALE) return { districts: [], skippedOutsideLima: 0, incomplete: false };

      const results = new Map<string, SourceDistrictResult>();
      const resultFor = (districtSlug: string): SourceDistrictResult => {
        let result = results.get(districtSlug);
        if (!result) {
          result = { districtSlug, pagesFetched: 0, blocked: false, errors: [], claimedTotal: null };
          results.set(districtSlug, result);
        }
        return result;
      };
      for (const district of districts) resultFor(district);

      const seen = new Set<string>();
      let skippedOutsideLima = 0;
      let incomplete = false;
      let pagesFetched = 0;
      const visited = new Set<string>();
      let maxPages = Infinity;
      let dropped = 0;
      let url: string | null = NEXO_LIST_URL;

      while (url) {
        // A site that ignores ?page=N would answer the same page for ever.
        if (visited.has(url) || visited.size >= maxPages) {
          log(`nexo: stopped at ${url}, the paging does not advance`);
          incomplete = true;
          break;
        }
        visited.add(url);
        let cards: ListingCard[];
        let nextPageUrl: string | null;
        try {
          const page = parseNexoListPage(await get(url));
          ({ cards, nextPageUrl } = page);
          dropped += page.droppedWithoutSlug;
          if (visited.size === 1) {
            maxPages = page.totalPages + 2;
            log(`nexo: the site lists ${page.totalProjects} projects in ${page.totalPages} pages`);
          }
        } catch (error) {
          log(`nexo ${url}: ${error instanceof Error ? error.message : String(error)}`);
          incomplete = true;
          break;
        }
        pagesFetched++;
        if (cards.length === 0) {
          log(`nexo ${url}: no cards before the last page`);
          incomplete = nextPageUrl !== null || pagesFetched === 1;
          break;
        }

        const byDistrict = new Map<string, ListingCard[]>();
        for (const card of cards) {
          // The list can shift while it is crawled, so a project may show up twice.
          if (card.sourcePostingId) {
            if (seen.has(card.sourcePostingId)) continue;
            seen.add(card.sourcePostingId);
          }
          if (!card.districtSlug) {
            skippedOutsideLima++;
            continue;
          }
          byDistrict.set(card.districtSlug, [...(byDistrict.get(card.districtSlug) ?? []), card]);
        }
        for (const [districtSlug, districtCards] of byDistrict) {
          resultFor(districtSlug);
          await onBatch({ districtSlug, cards: districtCards });
        }
        url = nextPageUrl;
      }

      if (dropped > 0) log(`nexo: ${dropped} projects without a slug were dropped`);
      const list = [...results.values()];
      if (list.length > 0) list[0].pagesFetched += pagesFetched;
      return { districts: list, skippedOutsideLima, incomplete };
    },
  };
}
