/**
 * Reads the /zonas form: a Google Maps link or typed coordinates, and the zone fields,
 * with the Spanish errors the form shows next to each field.
 */

import type { LatLon } from './geo';
import { isLimaDistrict } from './lima-districts';

export const DEFAULT_RADIUS_M = 400;
const LIMA_BOX = { latMin: -12.55, latMax: -11.55, lonMin: -77.25, lonMax: -76.6 };

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const PATTERNS = [
  // The place pin first: the @ part of a link is the map view, which can be off the pin.
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`[?&](?:q|query|ll)=${NUM},\\s*${NUM}`),
  new RegExp(`@${NUM},${NUM}`),
  new RegExp(`^\\s*${NUM}\\s*,\\s*${NUM}\\s*$`),
];

export function parseCoordinates(text: string): LatLon | null {
  for (const pattern of PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
  }
  return null;
}

export interface ZoneData {
  name: string;
  kind: 'DISTRICT' | 'CIRCLE';
  districtSlug: string | null;
  lat: number | null;
  lon: number | null;
  radiusM: number | null;
  rating: number;
  notes: string | null;
}

export function validateZoneInput(
  raw: Record<string, string | undefined>,
): { ok: true; zone: ZoneData } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = (raw.name ?? '').trim();
  if (!name) errors.name = 'Escribe un nombre';

  const ratingText = (raw.rating ?? '').trim();
  const rating = Number(ratingText);
  if (ratingText === '' || !Number.isInteger(rating) || rating < 0 || rating > 10) errors.rating = 'La nota va de 0 a 10';

  const notes = (raw.notes ?? '').trim() || null;
  const kind = raw.kind === 'DISTRICT' ? 'DISTRICT' : 'CIRCLE';

  if (kind === 'DISTRICT') {
    const slug = (raw.districtSlug ?? '').trim();
    if (!isLimaDistrict(slug)) errors.districtSlug = 'Elige un distrito de Lima';
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    return { ok: true, zone: { name, kind, districtSlug: slug, lat: null, lon: null, radiusM: null, rating, notes } };
  }

  const point = parseCoordinates(raw.coordinates ?? '');
  if (!point) {
    errors.coordinates = 'No pude leer las coordenadas. Pega un enlace de Google Maps o escribe "lat, lon"';
  } else if (point.lat < LIMA_BOX.latMin || point.lat > LIMA_BOX.latMax || point.lon < LIMA_BOX.lonMin || point.lon > LIMA_BOX.lonMax) {
    errors.coordinates = 'Las coordenadas no están en Lima';
  }
  const radiusText = (raw.radiusM ?? '').trim();
  const radiusM = radiusText === '' ? DEFAULT_RADIUS_M : Number(radiusText);
  if (!Number.isFinite(radiusM) || radiusM < 50 || radiusM > 3000) errors.radiusM = 'El radio va de 50 a 3000 m';

  if (Object.keys(errors).length > 0 || !point) return { ok: false, errors };
  return { ok: true, zone: { name, kind, districtSlug: null, lat: point.lat, lon: point.lon, radiusM: Math.round(radiusM), rating, notes } };
}
