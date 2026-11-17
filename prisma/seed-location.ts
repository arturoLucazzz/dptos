/**
 * Location data for the seed, with no network: synthetic places and square district
 * boundaries around the seeded districts, the two example zones, and the step that
 * writes them and runs the location refresh.
 *
 * The pure parts are exported for the seed-case tests; seedLocation needs a database.
 */

import type { PrismaClient } from '../lib/generated/prisma/client';
import { ZoneKind } from '../lib/generated/prisma/enums';
import type { Ring } from '../lib/location/geo';
import { refreshLocations } from '../lib/location/refresh';
import { PLACE_CATEGORIES, type PlaceCategory, type PlacePoint } from '../lib/location/score';
import type { ZoneShape } from '../lib/location/zones';
import { DISTRICTS } from './seed-districts';

/** Half the side of each seeded district square, in degrees (about 550 m). */
const HALF_DEG = 0.005;
const PLACES_PER_DISTRICT: Record<PlaceCategory, number> = { food: 40, park: 6, shop: 12, services: 15, transit: 20 };

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function seedBoundaries(): { slug: string; name: string; rings: Ring[] }[] {
  return DISTRICTS.map((d) => ({
    slug: d.slug,
    name: d.name,
    rings: [
      [
        [d.lon - HALF_DEG, d.lat - HALF_DEG],
        [d.lon + HALF_DEG, d.lat - HALF_DEG],
        [d.lon + HALF_DEG, d.lat + HALF_DEG],
        [d.lon - HALF_DEG, d.lat + HALF_DEG],
        [d.lon - HALF_DEG, d.lat - HALF_DEG],
      ],
    ],
  }));
}

export function seedPlaces(): (PlacePoint & { id: string })[] {
  const random = rng(4_242);
  const places: (PlacePoint & { id: string })[] = [];
  for (const d of DISTRICTS) {
    for (const category of PLACE_CATEGORIES) {
      for (let i = 0; i < PLACES_PER_DISTRICT[category]; i++) {
        places.push({
          id: `seed/${d.slug}-${category}-${i}`,
          category,
          lat: d.lat + (random() - 0.5) * 2 * HALF_DEG,
          lon: d.lon + (random() - 0.5) * 2 * HALF_DEG,
        });
      }
    }
  }
  return places;
}

export const SEED_ZONES = [
  { name: 'San Isidro', kind: 'DISTRICT', districtSlug: 'san-isidro', rating: 9, notes: 'Casi siempre bonito: lo de al lado también.' },
  { name: 'Parque Castilla', kind: 'CIRCLE', lat: -12.0849, lon: -77.0347, radiusM: 400, rating: 9, notes: 'Las calles alrededor del parque son muy buenas.' },
] as const;

/** The seed zones as the score sees them, with the seed boundaries. */
export function seedZoneShapes(): ZoneShape[] {
  const rings = new Map(seedBoundaries().map((b) => [b.slug, b.rings]));
  return SEED_ZONES.map((z, i) =>
    z.kind === 'DISTRICT'
      ? { id: `seed-zone-${i}`, name: z.name, rating: z.rating, kind: 'DISTRICT', districtSlug: z.districtSlug, rings: rings.get(z.districtSlug)! }
      : { id: `seed-zone-${i}`, name: z.name, rating: z.rating, kind: 'CIRCLE', lat: z.lat, lon: z.lon, radiusM: z.radiusM },
  );
}

/** Writes places, boundaries, and zones, then runs the location refresh. */
export async function seedLocation(db: PrismaClient): Promise<void> {
  const places = seedPlaces();
  await db.place.deleteMany();
  await db.place.createMany({ data: places.map((p) => ({ id: p.id, category: p.category, name: null, latitude: p.lat, longitude: p.lon })) });
  for (const b of seedBoundaries()) {
    await db.districtStat.upsert({ where: { slug: b.slug }, create: { slug: b.slug, name: b.name, boundary: b.rings }, update: { boundary: b.rings } });
  }
  await db.zone.deleteMany({ where: { name: { in: SEED_ZONES.map((z) => z.name) } } });
  for (const z of SEED_ZONES) {
    await db.zone.create({
      data:
        z.kind === 'DISTRICT'
          ? { name: z.name, kind: ZoneKind.DISTRICT, districtSlug: z.districtSlug, rating: z.rating, notes: z.notes }
          : { name: z.name, kind: ZoneKind.CIRCLE, latitude: z.lat, longitude: z.lon, radiusM: z.radiusM, rating: z.rating, notes: z.notes },
    });
  }
  const counts = await refreshLocations(db);
  console.log(`\nUbicación: ${places.length} lugares, ${SEED_ZONES.length} zonas, ${counts.scored} departamentos con puntaje.`);
}
