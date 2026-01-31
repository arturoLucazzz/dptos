/**
 * Build Urbania search URL from filters.
 *
 * Format: https://urbania.pe/buscar/{operation}-de-{property}-en-{district}--{city}--{region}?bedroomMin=&bedroomMax=&page=
 * Example: https://urbania.pe/buscar/venta-de-departamentos-en-lince--lima--lima?bedroomMin=1&bedroomMax=2&page=2
 */

import { ScraperFilters } from '../../types/index.js';

const BASE = 'https://urbania.pe/buscar';

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
  if (filters.minPrice != null) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice != null) params.set('maxPrice', String(filters.maxPrice));
  if (page > 1) params.set('page', String(page));

  // const antiquity = filters.customFilters?.antiquity;
  // if (antiquity != null) params.set('antiquity', String(antiquity));

  const query = params.toString();
  return query ? `${BASE}/${path}?${query}` : `${BASE}/${path}`;
}
