/** Server side of Inicio: the full sale rows with the panel's finance, never sent whole. */

import type { PanelAssumptions } from './assumption-defaults';
import { filterListings, queryDepartamentos, type DepartamentosRow } from './departamentos-query';
import { toListingFilter, type HomeFilters } from './home-filters';
import { recommend, type RecoMode } from './home';
import { toHomeRow, type HomeRow } from './home-rows';
import { getCachedSaleListings } from './listings';

export async function loadHomeRows(panel: PanelAssumptions): Promise<DepartamentosRow[]> {
  const universe = await getCachedSaleListings();
  return queryDepartamentos(universe.listings, universe.fixedAssumptions, {
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
    pageSize: 100000,
  }).rows;
}

export function recommendHome(
  rows: DepartamentosRow[],
  mode: RecoMode,
  n: number,
): { rows: HomeRow[]; hasMore: boolean } {
  const out = recommend(rows, mode, n);
  return { rows: out.rows.map(toHomeRow), hasMore: out.hasMore };
}

/** The rows the Inicio filters keep; unknown district slugs in the URL are ignored. */
export function filterHomeRows(rows: DepartamentosRow[], filters: HomeFilters): DepartamentosRow[] {
  const known = new Set(rows.map((r) => r.districtSlug));
  return filterListings(rows, toListingFilter(filters, known));
}

/** The districts Inicio can filter by, sorted by name. */
export function homeDistrictOptions(rows: DepartamentosRow[]): { value: string; label: string }[] {
  const names = new Map<string, string>();
  for (const r of rows) names.set(r.districtSlug, r.districtName);
  return [...names].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'));
}
