/** Server side of Inicio: the full sale rows with the panel's finance, never sent whole. */

import type { PanelAssumptions } from './assumption-defaults';
import { queryDepartamentos, type DepartamentosRow } from './departamentos-query';
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
