/**
 * Proper (inversiones.proper.com.pe) as a source adapter.
 *
 * Proper sells new-building projects and publishes the price of every unit in
 * public JSON, with no Cloudflare in front, so plain `fetch` is enough:
 *
 * - the project list comes from an API Gateway endpoint (about 50 projects),
 * - the build id comes from the `/propiedades` page, and
 * - each project's units from `/_next/data/<buildId>/proyecto/<slug>.json`, and
 *   each single apartment for immediate delivery (listed with tipo
 *   "departamento alquiler") from `/entrega-inmediata/<slug>.json`.
 *
 * The list holds every project in Lima whatever district was asked for, so the
 * `districts` filter is ignored: each project is handed over under its own
 * district. A district asked for but without projects still gets an (empty)
 * result, so the run can see it was covered.
 *
 * A project whose detail cannot be fetched after retries leaves its cards
 * missing, so the crawl is flagged incomplete rather than passed off as whole.
 */

import retry from 'async-retry';
import { Operation } from '@/lib/generated/prisma/enums';
import type { ListingCard } from '@/lib/listing-card';
import { districtSlugFromName } from '../../config/districts';
import { RateLimiter } from '../../utils/anti-blocking';
import type { SourceAdapter, SourceCrawlResult, SourceDistrictResult } from '../types';
import { PROPER_BASE_URL, parseProperBuildId, parseProperImmediate, parseProperProject } from './parse';

export const PROPER_LIST_URL = 'https://3nors0yi4b.execute-api.us-east-2.amazonaws.com/production/get_proyects_departments/';
const PROPERTIES_URL = `${PROPER_BASE_URL}/propiedades`;

/** What the adapter reaches outside itself for, replaceable in tests. */
export interface ProperAdapterDeps {
  /** GET a URL and return the body text; throws on a non-2xx answer. */
  fetchText: (url: string) => Promise<string>;
  /** Pause before every request. */
  wait: () => Promise<void>;
  retries: number;
  log: (message: string) => void;
}

function defaultDeps(): ProperAdapterDeps {
  const limiter = new RateLimiter(1000, 3000);
  return {
    fetchText: async (url) => {
      const response = await fetch(url, {
        headers: { Accept: 'application/json,text/html' },
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

interface ListedProject {
  slug: string;
  distrito: string | null;
  /** Single apartments for immediate delivery live under another route than projects. */
  immediate: boolean;
}

function parseList(body: string): ListedProject[] {
  const json: unknown = JSON.parse(body);
  if (!Array.isArray(json)) throw new Error('Proper list is not an array');
  const projects = json.flatMap((item): ListedProject[] => {
    const slug = (item as { slug?: unknown } | null)?.slug;
    if (typeof slug !== 'string' || !slug) return [];
    const distrito = (item as { distrito?: unknown }).distrito;
    const tipo = (item as { tipo?: unknown }).tipo;
    return [{ slug, distrito: typeof distrito === 'string' ? distrito : null, immediate: tipo === 'departamento alquiler' }];
  });
  if (projects.length === 0) throw new Error('Proper list holds no projects');
  return projects;
}

export function properAdapter(overrides: Partial<ProperAdapterDeps> = {}): SourceAdapter {
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
    id: 'proper',
    operations: [Operation.SALE],
    async crawl({ districts, operation, onBatch }): Promise<SourceCrawlResult> {
      if (operation !== Operation.SALE) return { districts: [], skippedOutsideLima: 0, incomplete: false };

      // These two failing means nothing can be crawled: the source failed as a whole.
      const projects = parseList(await get(PROPER_LIST_URL));
      const buildId = parseProperBuildId(await get(PROPERTIES_URL));
      if (!buildId) throw new Error('Proper: no buildId on /propiedades');
      log(`proper: ${projects.length} projects, build ${buildId}`);

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

      let skippedOutsideLima = 0;
      let incomplete = false;
      let sharedPages = 2;

      for (const { slug, distrito, immediate } of projects) {
        const listedSlug = districtSlugFromName(distrito);
        let cards: ListingCard[];
        try {
          const route = immediate ? 'entrega-inmediata' : 'proyecto';
          const url = `${PROPER_BASE_URL}/_next/data/${buildId}/${route}/${slug}.json?slug=${slug}`;
          const json: unknown = JSON.parse(await get(url));
          cards = immediate ? parseProperImmediate(json, slug) : parseProperProject(json, slug);
        } catch (error) {
          const message = `proper ${slug}: ${error instanceof Error ? error.message : String(error)}`;
          log(`${message}`);
          incomplete = true;
          if (listedSlug) {
            resultFor(listedSlug).errors.push(message);
            resultFor(listedSlug).pagesFetched++;
          } else {
            sharedPages++;
          }
          continue;
        }

        const districtSlug = cards[0].districtSlug;
        if (!districtSlug) {
          skippedOutsideLima += cards.length;
          sharedPages++;
          continue;
        }
        const result = resultFor(districtSlug);
        result.pagesFetched++;
        result.claimedTotal = (result.claimedTotal ?? 0) + cards.length;
        // The project card is first, so ingest sees it before its units.
        await onBatch({ districtSlug, cards });
      }

      const list = [...results.values()];
      if (list.length > 0) list[0].pagesFetched += sharedPages;
      return { districts: list, skippedOutsideLima, incomplete };
    },
  };
}
