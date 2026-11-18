/**
 * The one Overpass query that `pnpm location:places` sends, and the parsers for its answer.
 * Places come back with `out center tags;` (ways carry a center point) and district
 * boundaries with `out geom;` (members carry their coordinates).
 */

import type { Ring } from './geo';
import { LIMA_PROVINCE_DISTRICTS } from './lima-districts';
import type { PlaceCategory } from './score';

/** Each category and the OpenStreetMap key=value filters that feed it. */
const CATEGORY_TAGS: { category: PlaceCategory; key: string; values: string[] }[] = [
  { category: 'food', key: 'amenity', values: ['restaurant', 'cafe', 'fast_food'] },
  { category: 'park', key: 'leisure', values: ['park', 'garden'] },
  { category: 'park', key: 'place', values: ['square'] },
  { category: 'shop', key: 'shop', values: ['supermarket', 'convenience'] },
  { category: 'shop', key: 'amenity', values: ['marketplace'] },
  { category: 'services', key: 'amenity', values: ['pharmacy', 'clinic', 'hospital', 'doctors', 'school'] },
  { category: 'transit', key: 'highway', values: ['bus_stop'] },
  { category: 'transit', key: 'public_transport', values: ['station'] },
];

export function buildOverpassQuery(): string {
  const filters = CATEGORY_TAGS.map(({ key, values }) => `  nwr["${key}"~"^(${values.join('|')})$"](area.lima);`).join('\n');
  return [
    '[out:json][timeout:180];',
    'area["name"="Lima"]["admin_level"="6"]->.lima;',
    '(',
    filters,
    ');',
    'out center tags;',
    'rel["boundary"="administrative"]["admin_level"="8"](area.lima);',
    'out geom;',
  ].join('\n');
}

type Json = Record<string, unknown>;

function elements(json: unknown): Json[] {
  const list = (json as { elements?: unknown } | null)?.elements;
  return Array.isArray(list) ? (list.filter((e) => e && typeof e === 'object') as Json[]) : [];
}

function categoryOf(tags: Record<string, string>): PlaceCategory | null {
  for (const { category, key, values } of CATEGORY_TAGS) {
    if (tags[key] && values.includes(tags[key])) return category;
  }
  return null;
}

export function parseOverpassPlaces(
  json: unknown,
): { id: string; category: PlaceCategory; name: string | null; lat: number; lon: number }[] {
  const out: { id: string; category: PlaceCategory; name: string | null; lat: number; lon: number }[] = [];
  for (const el of elements(json)) {
    if (el.type === 'relation' && (el.tags as Json | undefined)?.boundary === 'administrative') continue;
    const tags = (el.tags ?? {}) as Record<string, string>;
    const category = categoryOf(tags);
    if (!category) continue;
    const center = (el.center ?? el) as { lat?: unknown; lon?: unknown };
    if (typeof center.lat !== 'number' || typeof center.lon !== 'number') continue;
    out.push({ id: `${el.type}/${el.id}`, category, name: tags.name ?? null, lat: center.lat, lon: center.lon });
  }
  return out;
}

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const NAME_TO_SLUG = new Map<string, string>([
  ...LIMA_PROVINCE_DISTRICTS.map((d) => [normalizeName(d.name), d.slug] as [string, string]),
  ['cercado de lima', 'lima'],
  ['magdalena', 'magdalena'],
  ['surco', 'santiago-de-surco'],
]);

type Point = [number, number];
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

/** Joins way pieces end to end into closed rings, flipping pieces as needed. */
function joinRings(pieces: Point[][]): Ring[] {
  const rest = pieces.filter((p) => p.length >= 2).map((p) => [...p]);
  const rings: Ring[] = [];
  while (rest.length > 0) {
    const ring = rest.shift()!;
    let grew = true;
    while (!same(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      const end = ring[ring.length - 1];
      for (let i = 0; i < rest.length; i++) {
        const piece = rest[i];
        if (same(piece[0], end)) ring.push(...piece.slice(1));
        else if (same(piece[piece.length - 1], end)) ring.push(...piece.slice(0, -1).reverse());
        else continue;
        rest.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) rings.push(ring as Ring);
  }
  return rings;
}

export function parseOverpassBoundaries(json: unknown): { slug: string; name: string; rings: Ring[] }[] {
  const out: { slug: string; name: string; rings: Ring[] }[] = [];
  for (const el of elements(json)) {
    if (el.type !== 'relation') continue;
    const tags = (el.tags ?? {}) as Record<string, string>;
    if (tags.boundary !== 'administrative' || tags.admin_level !== '8' || !tags.name) continue;
    const slug = NAME_TO_SLUG.get(normalizeName(tags.name));
    if (!slug) continue;
    const members = Array.isArray(el.members) ? (el.members as Json[]) : [];
    const pieces = members
      .filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === '') && Array.isArray(m.geometry))
      .map((m) => (m.geometry as { lat: number; lon: number }[]).map((g) => [g.lon, g.lat] as Point));
    const rings = joinRings(pieces);
    if (rings.length > 0) out.push({ slug, name: tags.name, rings });
  }
  return out;
}
