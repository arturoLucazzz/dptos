/**
 * Server side of the workspace: one page of cards for the filters, and the picks as panel rows.
 * The full sale universe stays on the server; the browser gets 24 rows at a time.
 */

import type { PanelAssumptions } from '../assumption-defaults';
import { queryDepartamentos } from '../departamentos-query';
import { toHomeRow, type HomeRow } from '../home-rows';
import { getCachedSaleListings } from '../listings';
import { loadProjectRows, queryProjects, type ProjectRow } from '../project-rows';
import { filtersToQuery } from '../workspace-sorts';
import type { Ring } from '../location/geo';
import type { InvestmentFilters } from './filters';
import { circleRing, projectPoints, unitPoints, type MapPoint, type ZoneOutlineInput } from './map-features';
import { toPickView, type PickItemInput, type PickView } from './pick-view';

export const CARDS_PAGE_SIZE = 24;

export type CardRow = { type: 'unit'; row: HomeRow } | { type: 'project'; row: ProjectRow };
export type CardsPage = { rows: CardRow[]; total: number; hasMore: boolean };

export async function loadCards(filters: InvestmentFilters, panel: PanelAssumptions, page: number): Promise<CardsPage> {
  const size = CARDS_PAGE_SIZE;
  if (filters.kind === 'projects') {
    const out = queryProjects(await loadProjectRows(), filters, page, size);
    return {
      rows: out.rows.map((row) => ({ type: 'project', row })),
      total: out.total,
      hasMore: page * size < out.total,
    };
  }
  const universe = await getCachedSaleListings();
  const out = queryDepartamentos(universe.listings, universe.fixedAssumptions, filtersToQuery(filters, panel, page, size));
  return {
    rows: out.rows.map((row) => ({ type: 'unit', row: toHomeRow(row) })),
    total: out.total,
    hasMore: page * size < out.total,
  };
}

/** Every row that matches the filters and has coordinates, as map pins. Sort and paging do not apply. */
export async function loadPoints(filters: InvestmentFilters, panel: PanelAssumptions): Promise<MapPoint[]> {
  if (filters.kind === 'projects') {
    const rows = await loadProjectRows();
    return projectPoints(queryProjects(rows, filters, 1, Math.max(1, rows.length)).rows);
  }
  const universe = await getCachedSaleListings();
  const size = Math.max(1, universe.listings.length);
  return unitPoints(queryDepartamentos(universe.listings, universe.fixedAssumptions, filtersToQuery(filters, panel, 1, size)).rows);
}

export const CARD_IDS_MAX = 50;

/**
 * The cards for these ids (postingIds for units, projectIds for projects), ignoring the
 * other filters and paging: the map popup asks for a pin that is not on the loaded pages.
 */
export async function loadCardsByIds(filters: InvestmentFilters, panel: PanelAssumptions, ids: string[]): Promise<CardsPage> {
  const wanted = new Set(ids.slice(0, CARD_IDS_MAX));
  if (filters.kind === 'projects') {
    const rows = (await loadProjectRows()).filter((r) => wanted.has(r.projectId));
    return { rows: rows.map((row) => ({ type: 'project', row })), total: rows.length, hasMore: false };
  }
  const universe = await getCachedSaleListings();
  const picked = universe.listings.filter((l) => wanted.has(l.postingId));
  const open: InvestmentFilters = { ...filters, districts: [], sources: [], priceMin: null, priceMax: null, bedroomsMin: null, bedroomsMax: null, locationMin: null, area: null };
  const out = queryDepartamentos(picked, universe.fixedAssumptions, filtersToQuery(open, panel, 1, Math.max(1, picked.length)));
  return { rows: out.rows.map((row) => ({ type: 'unit', row: toHomeRow(row) })), total: out.total, hasMore: false };
}

/** The saved zones as outlines for the map. A zone with no shape to draw is left out. */
export async function loadZoneOutlines(): Promise<ZoneOutlineInput[]> {
  const { prisma } = await import('../db');
  const zones = await prisma.zone.findMany({ orderBy: { createdAt: 'asc' } });
  const slugs = [...new Set(zones.flatMap((z) => (z.kind === 'DISTRICT' && z.districtSlug ? [z.districtSlug] : [])))];
  const stats = slugs.length
    ? await prisma.districtStat.findMany({ where: { slug: { in: slugs } }, select: { slug: true, boundary: true } })
    : [];
  const boundaries = new Map(stats.map((s) => [s.slug, (s.boundary as Ring[] | null) ?? []]));
  return zones.flatMap((z): ZoneOutlineInput[] => {
    const base = { id: z.id, name: z.name, rating: z.rating };
    if (z.kind === 'POLYGON') return Array.isArray(z.boundary) ? [{ ...base, rings: z.boundary as Ring[] }] : [];
    if (z.kind === 'DISTRICT') return [{ ...base, rings: boundaries.get(z.districtSlug ?? '') ?? [] }];
    if (z.latitude == null || z.longitude == null || z.radiusM == null) return [];
    return [{ ...base, rings: [circleRing(Number(z.latitude), Number(z.longitude), z.radiusM)] }];
  });
}

export async function loadDistrictOptions(): Promise<{ value: string; label: string }[]> {
  return (await getCachedSaleListings()).districtOptions;
}

/** The picks with today's numbers; a pick that is no longer live comes back as gone. */
export async function loadPickViews(items: PickItemInput[], panel: PanelAssumptions): Promise<PickView[]> {
  if (items.length === 0) return [];
  const propertyIds = new Set(items.flatMap((i) => (i.propertyId ? [i.propertyId] : [])));
  const hasProjects = items.some((i) => i.projectId);
  const [universe, projects] = await Promise.all([getCachedSaleListings(), hasProjects ? loadProjectRows() : Promise.resolve([])]);

  const picked = universe.listings.filter((l) => l.propertyId != null && propertyIds.has(l.propertyId));
  const units = new Map(
    queryDepartamentos(picked, universe.fixedAssumptions, {
      districts: [],
      sources: [],
      priceMin: null,
      priceMax: null,
      bedroomsMin: null,
      bedroomsMax: null,
      coverageMin: null,
      panel,
      sort: 'monthlyGain',
      order: 'desc',
      page: 1,
      pageSize: Math.max(1, picked.length),
    }).rows.map((r) => [r.propertyId as string, r])
  );
  const projectById = new Map(projects.map((p) => [p.projectId, p]));

  // Only a gone pick needs its district from the database.
  const gone = items.filter((i) => (i.propertyId ? !units.has(i.propertyId) : !projectById.has(i.projectId ?? '')));
  const slugs = new Map<string, string>();
  if (gone.length > 0) {
    const { prisma } = await import('../db');
    const [props, projs] = await Promise.all([
      prisma.property.findMany({
        where: { id: { in: gone.flatMap((i) => (i.propertyId ? [i.propertyId] : [])) } },
        select: { id: true, districtSlug: true },
      }),
      prisma.project.findMany({
        where: { id: { in: gone.flatMap((i) => (i.projectId ? [i.projectId] : [])) } },
        select: { id: true, districtSlug: true },
      }),
    ]);
    for (const r of [...props, ...projs]) slugs.set(r.id, r.districtSlug);
  }
  const labels = new Map(universe.districtOptions.map((d) => [d.value, d.label]));

  return items.map((item) => {
    const slug = slugs.get(item.propertyId ?? item.projectId ?? '') ?? '';
    return toPickView(
      item,
      item.propertyId ? (units.get(item.propertyId) ?? null) : null,
      item.projectId ? (projectById.get(item.projectId) ?? null) : null,
      { districtName: labels.get(slug) ?? slug }
    );
  });
}

/** Photo lookup for the list page thumbnails, built once per request. */
export async function pickImageLookup(
  needProjects: boolean
): Promise<(item: { propertyId: string | null; projectId: string | null }) => string | null> {
  const [universe, projects] = await Promise.all([getCachedSaleListings(), needProjects ? loadProjectRows() : Promise.resolve([])]);
  const unitImage = new Map(universe.listings.flatMap((l) => (l.propertyId ? [[l.propertyId, l.imageUrl] as const] : [])));
  const projectImage = new Map(projects.map((p) => [p.projectId, p.imageUrl]));
  return (item) =>
    (item.propertyId ? unitImage.get(item.propertyId) : item.projectId ? projectImage.get(item.projectId) : null) ?? null;
}
