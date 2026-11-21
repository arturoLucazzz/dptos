/**
 * Real-estate projects as rows for the workspace.
 *
 * The DB load is thin; grouping and querying are pure so they are tested alone.
 * A project's price is a "desde": the lowest live price among its postings.
 */

import { districtName } from './district-name';
import { Operation, PostingKind } from './generated/prisma/enums';
import type { InvestmentFilters } from './investments/filters';
import { pointInPolygon } from './location/geo';
import { postingSource, postingUrl } from './official-price';
import { livePostingWhere } from './possibly-sold';

export interface ProjectRow {
  projectId: string;
  name: string;
  districtSlug: string;
  districtName: string;
  priceFromPen: number | null;
  deliveryDate: string | null;
  stage: string | null;
  imageUrl: string | null;
  url: string | null;
  lat: number | null;
  lon: number | null;
  postingIds: string[];
  /** ISO time of the newest posting (first online date, else first seen); only for the `newest` sort. */
  newestAt: string | null;
}

/** What the grouping step reads from a PROJECT posting. Decimals are already numbers or strings. */
export interface ProjectPostingInput {
  id: string;
  source: string;
  sourcePath: string | null;
  firstSeenAt: Date;
  project: {
    id: string;
    name: string | null;
    districtSlug: string;
    latitude: unknown;
    longitude: unknown;
    deliveryDate: string | null;
    stage: string | null;
  } | null;
  currentSnapshot: {
    pricePen: unknown;
    imageUrl: string | null;
    sourceUrl: string | null;
    firstDateOnline: Date | null;
  } | null;
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** One row per project, with the lowest live price. Postings without a project are dropped. */
export function groupProjectPostings(postings: ProjectPostingInput[]): ProjectRow[] {
  const groups = new Map<string, ProjectPostingInput[]>();
  for (const posting of postings) {
    if (!posting.project) continue;
    const list = groups.get(posting.project.id);
    if (list) list.push(posting);
    else groups.set(posting.project.id, [posting]);
  }

  const rows: ProjectRow[] = [];
  for (const group of groups.values()) {
    const project = group[0].project!;
    const priced = group.map((p) => ({ p, price: numOrNull(p.currentSnapshot?.pricePen) }));
    // Cheapest first, unpriced last, so the card shows the posting that sets the "desde".
    priced.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    const prices = priced.flatMap((x) => (x.price != null && x.price > 0 ? [x.price] : []));

    const withImage = priced.find((x) => x.p.currentSnapshot?.imageUrl);
    const withUrl = priced
      .map((x) => postingUrl(postingSource(x.p.source), x.p.sourcePath, x.p.currentSnapshot?.sourceUrl ?? null))
      .find((u) => u != null);

    const times = group.map((p) => (p.currentSnapshot?.firstDateOnline ?? p.firstSeenAt).getTime());
    rows.push({
      projectId: project.id,
      name: project.name ?? 'Proyecto sin nombre',
      districtSlug: project.districtSlug,
      districtName: districtName(project.districtSlug),
      priceFromPen: prices.length ? Math.min(...prices) : null,
      deliveryDate: project.deliveryDate,
      stage: project.stage,
      imageUrl: withImage?.p.currentSnapshot?.imageUrl ?? null,
      url: withUrl ?? null,
      lat: numOrNull(project.latitude),
      lon: numOrNull(project.longitude),
      postingIds: group.map((p) => p.id),
      newestAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    });
  }
  return rows;
}

/**
 * Filter, sort and page the rows. Districts, price range and area apply; bedrooms,
 * sources and location do not, because a project has no single unit to measure them on.
 * Rows without a value sort last in both orders.
 */
export function queryProjects(
  rows: ProjectRow[],
  f: InvestmentFilters,
  page: number,
  pageSize: number
): { rows: ProjectRow[]; total: number } {
  let list = rows;
  if (f.districts.length > 0) {
    const set = new Set(f.districts);
    list = list.filter((r) => set.has(r.districtSlug));
  }
  if (f.priceMin != null) list = list.filter((r) => r.priceFromPen != null && r.priceFromPen >= f.priceMin!);
  if (f.priceMax != null) list = list.filter((r) => r.priceFromPen != null && r.priceFromPen <= f.priceMax!);
  if (f.area) {
    const rings = [f.area];
    list = list.filter((r) => r.lat != null && r.lon != null && pointInPolygon({ lat: r.lat, lon: r.lon }, rings));
  }

  const byNewest = f.sort === 'newest';
  // Same direction as the units: ascending is newest first, like days published.
  const dir = byNewest ? (f.order === 'asc' ? 1 : -1) : f.sort === 'pricePen' || f.sort === 'pricePerM2' ? (f.order === 'asc' ? 1 : -1) : 1;
  const value = (r: ProjectRow): number => {
    if (byNewest) return r.newestAt == null ? Number.NaN : -Date.parse(r.newestAt);
    return r.priceFromPen ?? Number.NaN;
  };
  const sorted = [...list].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (Number.isNaN(av) !== Number.isNaN(bv)) return Number.isNaN(av) ? 1 : -1;
    if (av === bv || (Number.isNaN(av) && Number.isNaN(bv))) return a.projectId.localeCompare(b.projectId);
    return av < bv ? -dir : dir;
  });

  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  return { rows: sorted.slice((current - 1) * size, current * size), total: sorted.length };
}

// The DB modules load lazily so the pure steps above run in tests with no database.
async function loadProjectRowsUncached(): Promise<ProjectRow[]> {
  const [{ prisma }, { possiblySoldCutoffs }] = await Promise.all([import('./db'), import('./market')]);
  const cutoffs = await possiblySoldCutoffs();
  const postings = await prisma.posting.findMany({
    where: {
      kind: PostingKind.PROJECT,
      operation: Operation.SALE,
      projectId: { not: null },
      AND: [livePostingWhere(cutoffs)],
    },
    select: {
      id: true,
      source: true,
      sourcePath: true,
      firstSeenAt: true,
      project: {
        select: { id: true, name: true, districtSlug: true, latitude: true, longitude: true, deliveryDate: true, stage: true },
      },
      currentSnapshot: { select: { pricePen: true, imageUrl: true, sourceUrl: true, firstDateOnline: true } },
    },
  });
  return groupProjectPostings(postings);
}

/** Same memo rules as the sale listings: keyed by scrape run, cleared by `invalidateSaleListings`. */
const MEMO_TTL_MS = 3600 * 1000;
const SHAPE_VERSION = 'projects-v1';
const memoHolder = globalThis as unknown as {
  __projectRowsMemo?: { key: string; at: number; value: Promise<ProjectRow[]> };
};

/** Live PROJECT sale postings grouped by project, with the lowest live price as `priceFromPen`. */
export async function loadProjectRows(): Promise<ProjectRow[]> {
  const { latestScrapeCacheKey } = await import('./listings');
  const key = `${SHAPE_VERSION}:${await latestScrapeCacheKey()}`;
  const memo = memoHolder.__projectRowsMemo;
  if (memo && memo.key === key && Date.now() - memo.at < MEMO_TTL_MS) return memo.value;

  const value = loadProjectRowsUncached();
  const entry = { key, at: Date.now(), value };
  memoHolder.__projectRowsMemo = entry;
  value.catch(() => {
    if (memoHolder.__projectRowsMemo === entry) memoHolder.__projectRowsMemo = undefined;
  });
  return value;
}
