import type { PanelAssumptions } from './assumption-defaults';
import type { DepartamentosQueryInput, DepartamentosSortId } from './departamentos-query';
import type { InvestmentFilters } from './investments/filters';

/** The sorts the workspace offers, in menu order, each with its natural direction. */
export const WORKSPACE_SORTS: { id: DepartamentosSortId; label: string; order: 'asc' | 'desc' }[] = [
  { id: 'monthlyGain', label: 'Ganancia mensual', order: 'desc' },
  { id: 'grossYield', label: 'Rentabilidad bruta', order: 'desc' },
  { id: 'cashReturn', label: 'Rinde sobre efectivo', order: 'desc' },
  { id: 'descuento', label: 'Bajo precio de mercado', order: 'desc' },
  { id: 'pricePerM2', label: 'Precio por m²', order: 'asc' },
  { id: 'pricePen', label: 'Precio', order: 'asc' },
  { id: 'entryCost', label: 'Efectivo día 1', order: 'asc' },
  { id: 'location', label: 'Ubicación', order: 'desc' },
  { id: 'newest', label: 'Más nuevos', order: 'asc' },
];

export function filtersToQuery(
  f: InvestmentFilters,
  panel: PanelAssumptions,
  page: number,
  pageSize: number
): DepartamentosQueryInput {
  return {
    districts: f.districts,
    sources: f.sources,
    priceMin: f.priceMin,
    priceMax: f.priceMax,
    bedroomsMin: f.bedroomsMin,
    bedroomsMax: f.bedroomsMax,
    coverageMin: null,
    locationMin: f.locationMin,
    area: f.area,
    panel,
    sort: f.sort,
    order: f.order,
    page,
    pageSize,
  };
}
