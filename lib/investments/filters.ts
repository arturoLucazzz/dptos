/**
 * The filters an investment remembers, and the small text rules for its names and notes.
 * Pure: no database, so it is tested alone.
 */

import { DEPARTAMENTOS_SORT_IDS, type DepartamentosSortId } from '../departamentos-query';
import type { SourceId } from '../listing-card';
import { isSourceId } from '../official-price';
import type { Ring } from '../location/geo';
import { validatePolygon } from '../location/polygon-input';

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

/** A stored area must be a closed ring that validatePolygon accepts, so a bad one never filters. */
function parseArea(value: unknown): Ring | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const points: [number, number][] = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2) return null;
    const [lon, lat] = point;
    if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    points.push([lon, lat]);
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return null;
  const checked = validatePolygon(points);
  return checked.ok ? checked.ring : null;
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

/** "1 elegido", "3 elegidos". */
export function picksLabel(n: number): string {
  return n === 1 ? '1 elegido' : `${n} elegidos`;
}

export type PickTarget = { propertyId: string } | { projectId: string };

const isId = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** A pick target from the browser: exactly one of propertyId and projectId, a non-empty string. */
export function parsePickTarget(raw: unknown): PickTarget | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const hasProperty = o.propertyId !== undefined;
  const hasProject = o.projectId !== undefined;
  if (hasProperty === hasProject) return null;
  if (hasProperty) return isId(o.propertyId) ? { propertyId: o.propertyId } : null;
  return isId(o.projectId) ? { projectId: o.projectId } : null;
}
