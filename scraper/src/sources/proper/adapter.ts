/**
 * Proper (inversiones.proper.com.pe) as a source adapter.
 *
 * Proper sells new-building projects and publishes them in public JSON, with no
 * Cloudflare in front, so plain `fetch` is enough:
 *
 * - the project list comes from an API Gateway endpoint (about 50 projects),
 * - each project from the same gateway's `proyecto_profile/<slug>/`, and its
 *   images from `/api/galeria-proyecto?slug=<slug>` (a failed gallery falls back
 *   to the facade in the list and does not fail the project),
 * - each single apartment for immediate delivery (listed with tipo
 *   "departamento alquiler") from `/_next/data/<buildId>/entrega-inmediata/<slug>.json`,
 *   where the build id comes from `/propiedades`, fetched only when such a unit
 *   is listed.
 *
 * Proper no longer publishes per-unit prices, so a project is one PROJECT card.
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
import { PROPER_BASE_URL, parseProperBuildId, parseProperImmediate, parseProperProfile } from './parse';

export const PROPER_LIST_URL = 'https://3nors0yi4b.execute-api.us-east-2.amazonaws.com/production/get_proyects_departments/';
const PROFILE_URL = 'https://3nors0yi4b.execute-api.us-east-2.amazonaws.com/production/proyecto_profile';
const GALLERY_URL = `${PROPER_BASE_URL}/api/galeria-proyecto`;
const PROPERTIES_URL = `${PROPER_BASE_URL}/propiedades`;

/** A non-2xx answer, carrying its status so a 404 (delisted) can be told from a failure. */
export class ProperHttpError extends Error {
  constructor(
    readonly status: number,
    url: string
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

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
      if (!response.ok) throw new ProperHttpError(response.status, url);
      return response.text();
    },
    wait: () => limiter.wait(),
    retries: Number(process.env.PAGE_RETRIES) || 3,
    log: (message) => console.log(message),
  };
}

function isNotFound(json: unknown): boolean {
  return typeof json === 'object' && json !== null && (json as { notFound?: unknown }).notFound === true;
}

interface ListedProject {
  slug: string;
  distrito: string | null;
  /** Single apartments for immediate delivery live under another route than projects. */
  immediate: boolean;
  moneda: string | null;
  facade: string | null;
}

function parseList(body: string): ListedProject[] {
  const json: unknown = JSON.parse(body);
  if (!Array.isArray(json)) throw new Error('Proper list is not an array');
  const projects = json.flatMap((item): ListedProject[] => {
    const slug = (item as { slug?: unknown } | null)?.slug;
    if (typeof slug !== 'string' || !slug) return [];
    const distrito = (item as { distrito?: unknown }).distrito;
    const tipo = (item as { tipo?: unknown }).tipo;
    const moneda = (item as { tipo_moneda?: unknown }).tipo_moneda;
    const facade = (item as { url_fachada?: unknown }).url_fachada;
    return [
      {
        slug,
        distrito: typeof distrito === 'string' ? distrito : null,
        immediate: tipo === 'departamento alquiler',
        moneda: typeof moneda === 'string' ? moneda : null,
        facade: typeof facade === 'string' && facade ? facade : null,
      },
    ];
  });
  if (projects.length === 0) throw new Error('Proper list holds no projects');
  return projects;
}

export function properAdapter(overrides: Partial<ProperAdapterDeps> = {}): SourceAdapter {
  const deps = { ...defaultDeps(), ...overrides };
  const { wait, retries, log } = deps;

  const get = (url: string) =>
    retry(
      async (bail) => {
        await wait();
        try {
          return await deps.fetchText(url);
        } catch (error) {
          // A 404 will not change on a retry.
          if (error instanceof ProperHttpError && error.status === 404) {
            bail(error);
            return '';
          }
          throw error;
        }
      },
      { retries, factor: 2, minTimeout: 5_000, maxTimeout: 60_000 }
    );

  return {
    id: 'proper',
    operations: [Operation.SALE],
    wholeSite: true,
    async crawl({ districts, operation, onBatch, maxPages }): Promise<SourceCrawlResult> {
      if (operation !== Operation.SALE) return { districts: [], skippedOutsideLima: 0, incomplete: false };

      // The list failing means nothing can be crawled: the source failed as a whole.
      const projects = parseList(await get(PROPER_LIST_URL));
      // Only immediate units need the build id; without any, skip the page.
      let buildId: string | null = null;
      if (projects.some((p) => p.immediate)) {
        buildId = parseProperBuildId(await get(PROPERTIES_URL));
        if (!buildId) throw new Error('Proper: no buildId on /propiedades');
      }
      log(`proper: ${projects.length} projects${buildId ? `, build ${buildId}` : ''}`);

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

      // A capped crawl (scrape:check) reads the requested districts first, so one
      // fetch is enough to see real cards.
      const wanted = new Set(districts);
      const ordered =
        maxPages == null
          ? projects
          : [...projects]
              .sort(
                (a, b) =>
                  Number(wanted.has(districtSlugFromName(b.distrito) ?? '')) -
                  Number(wanted.has(districtSlugFromName(a.distrito) ?? ''))
              )
              .slice(0, maxPages);

      for (const { slug, distrito, immediate, moneda, facade } of ordered) {
        const listedSlug = districtSlugFromName(distrito);
        let cards: ListingCard[];
        try {
          if (immediate) {
            const url = `${PROPER_BASE_URL}/_next/data/${buildId}/entrega-inmediata/${slug}.json?slug=${slug}`;
            const json: unknown = JSON.parse(await get(url));
            if (isNotFound(json)) throw new ProperHttpError(404, url);
            cards = parseProperImmediate(json, slug);
          } else {
            const profileUrl = `${PROFILE_URL}/${slug}/`;
            const profile: unknown = JSON.parse(await get(profileUrl));
            if (isNotFound(profile)) throw new ProperHttpError(404, profileUrl);
            let images: string[] = [];
            try {
              const gallery = JSON.parse(await get(`${GALLERY_URL}?slug=${slug}`)) as { imagenes?: unknown };
              if (Array.isArray(gallery.imagenes)) images = gallery.imagenes.filter((v): v is string => typeof v === 'string');
            } catch (error) {
              log(`proper ${slug}: gallery failed, ${error instanceof Error ? error.message : String(error)}`);
            }
            if (images.length === 0 && facade) images = [facade];
            cards = parseProperProfile(profile, slug, images, moneda);
          }
          // Read below for the district; an empty answer is a failed fetch, not a crash.
          if (cards.length === 0) throw new Error('no cards in the answer');
        } catch (error) {
          if (error instanceof ProperHttpError && error.status === 404) {
            // Delisted since the list was cached: nothing to fetch, nothing missing.
            log(`proper ${slug}: ya no publicado`);
            continue;
          }
          const message = `proper ${slug}: ${error instanceof Error ? error.message : String(error)}`;
          log(message);
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
