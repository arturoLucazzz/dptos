/**
 * Build Urbania search URL from filters.
 *
 * Format: https://urbania.pe/buscar/{operation}-de-{property}-en-{district}--{city}--{region}?bedroomMin=&bedroomMax=&page=
 * Example: https://urbania.pe/buscar/venta-de-departamentos-en-lince--lima--lima?bedroomMin=1&bedroomMax=2&page=2
 */

import { ScraperFilters, UrbaniaSort } from '../../types/index';

const BASE = 'https://urbania.pe/buscar';

/** Query values Urbania accepts for the "Ordenar" dropdown. */
const SORT_PARAM: Record<UrbaniaSort, string> = {
  relevance: 'relevance',
  priceAsc: 'low_price',
  priceDesc: 'high_price',
  newest: 'more_recent',
  mostViewed: 'most_visit',
  priceDropped: 'most_lowered_price',
};

/** Urbania's currency ids, used by the price filter. */
const CURRENCY_ID = { PEN: '6', USD: '2' } as const;

function slug(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function buildUrbaniaSearchUrl(filters: ScraperFilters, page: number = 1): string {
  const operation =
    filters.operationType === 'rent'
      ? 'alquiler'
      : filters.operationType === 'sale'
        ? 'venta'
        : 'venta';
  const property =
    filters.propertyType === 'apartment'
      ? 'departamentos'
      : filters.propertyType === 'house'
        ? 'casas'
        : 'departamentos';

  const district = filters.district || filters.location || 'lima';
  const city = filters.city || 'lima';
  const region = city;

  const path = `${operation}-de-${property}-en-${slug(district)}--${slug(city)}--${slug(region)}`;
  const params = new URLSearchParams();

  if (filters.minBedrooms != null) params.set('bedroomMin', String(filters.minBedrooms));
  if (filters.maxBedrooms != null) params.set('bedroomMax', String(filters.maxBedrooms));
  // These are the names the site's own filter uses. `minPrice`/`maxPrice` parse
  // fine and are then ignored, which is worse than an error.
  if (filters.minPrice != null) params.set('priceMin', String(Math.round(filters.minPrice)));
  if (filters.maxPrice != null) params.set('priceMax', String(Math.round(filters.maxPrice)));
  if (filters.minPrice != null || filters.maxPrice != null) {
    params.set('currencyId', CURRENCY_ID.PEN);
  }
  // Price banding only works if the ordering is stable and price-based, so the
  // sort is part of the same mechanism rather than a cosmetic option.
  if (filters.sort) params.set('sort', SORT_PARAM[filters.sort]);
  if (page > 1) params.set('page', String(page));

  const query = params.toString();
  return query ? `${BASE}/${path}?${query}` : `${BASE}/${path}`;
}
