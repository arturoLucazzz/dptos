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
import type { InvestmentFilters } from './filters';
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
