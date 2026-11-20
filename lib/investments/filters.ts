/**
 * The filters an investment remembers, and the small text rules for its names and notes.
 * Pure: no database, so it is tested alone.
 */

import { DEPARTAMENTOS_SORT_IDS, type DepartamentosSortId } from '../departamentos-query';
import type { SourceId } from '../listing-card';
import { isSourceId } from '../official-price';
import type { Ring } from '../location/geo';

export type InvestmentFilters = {
  districts: string[];
  sources: SourceId[];
  priceMin: number | null;
  priceMax: number | null;
  bedroomsMin: number | null;
  bedroomsMax: number | null;
  locationMin: number | null;
  kind: 'units' | 'projects';
  sort: DepartamentosSortId;
  order: 'asc' | 'desc';
  area: Ring | null;
};

export const DEFAULT_FILTERS: InvestmentFilters = {
  districts: [],
  sources: [],
  priceMin: null,
  priceMax: null,
  bedroomsMin: null,
  bedroomsMax: null,
  locationMin: null,
  kind: 'units',
  sort: 'monthlyGain',
  order: 'desc',
  area: null,
};

export const NOTE_MAX = 280;
export const NAME_MAX = 80;

function toObject(raw: unknown): Record<string, unknown> {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nonNegative(value: unknown, round: boolean): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return round ? Math.round(value) : value;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function parseArea(value: unknown): Ring | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const ring: Ring = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2) return null;
    const [lon, lat] = point;
    if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    ring.push([lon, lat]);
  }
  return ring;
}

export function parseInvestmentFilters(raw: unknown): InvestmentFilters {
  const o = toObject(raw);
  const sort = typeof o.sort === 'string' && (DEPARTAMENTOS_SORT_IDS as readonly string[]).includes(o.sort)
    ? (o.sort as DepartamentosSortId)
    : DEFAULT_FILTERS.sort;
  return {
    districts: strings(o.districts),
    sources: strings(o.sources).filter(isSourceId),
    priceMin: nonNegative(o.priceMin, false),
    priceMax: nonNegative(o.priceMax, false),
    bedroomsMin: nonNegative(o.bedroomsMin, true),
    bedroomsMax: nonNegative(o.bedroomsMax, true),
    locationMin: nonNegative(o.locationMin, false),
    kind: o.kind === 'projects' ? 'projects' : 'units',
    sort,
    order: o.order === 'asc' ? 'asc' : 'desc',
    area: parseArea(o.area),
  };
}

/** One line, at most 280 characters; empty becomes null. */
export function normalizeNote(note: string): string | null {
  const line = note.replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, NOTE_MAX).trim();
  return line === '' ? null : line;
}

/** Trimmed, at most 80 characters; empty keeps the old name. */
export function normalizeName(name: string, previous: string): string {
  const trimmed = name.trim().slice(0, NAME_MAX).trim();
  return trimmed === '' ? previous : trimmed;
}
