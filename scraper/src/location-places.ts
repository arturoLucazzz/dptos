/**
 * pnpm location:places
 *
 * Downloads the places and district boundaries of the province of Lima from
 * OpenStreetMap in ONE Overpass request, saves a copy under data/location/, and
 * replaces the Place rows. Run it by hand about once a month; then run
 * pnpm location:refresh (or wait for the next scrape) to recompute the scores.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { prisma } from '@/lib/db';
import { buildOverpassQuery, parseOverpassBoundaries, parseOverpassPlaces } from '@/lib/location/overpass';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const TIMEOUT_MS = 180_000;
const CHUNK = 5_000;

async function main(): Promise<void> {
  console.log('Descargando lugares y límites de Lima desde OpenStreetMap (una consulta)…');
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'dptos-location/1.0' },
    body: new URLSearchParams({ data: buildOverpassQuery() }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Overpass respondió ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const json: unknown = await response.json();

  const places = parseOverpassPlaces(json);
  const boundaries = parseOverpassBoundaries(json);
  if (places.length === 0) throw new Error('Overpass no devolvió lugares. No se cambió nada.');

  mkdirSync('data/location', { recursive: true });
  writeFileSync('data/location/places-lima.json', JSON.stringify(places));
  writeFileSync('data/location/boundaries-lima.json', JSON.stringify(boundaries));

  await prisma.$transaction(
    async (tx) => {
      await tx.place.deleteMany();
      for (let i = 0; i < places.length; i += CHUNK) {
        await tx.place.createMany({
          data: places.slice(i, i + CHUNK).map((p) => ({ id: p.id, category: p.category, name: p.name, latitude: p.lat, longitude: p.lon })),
          skipDuplicates: true,
        });
      }
      for (const b of boundaries) {
        await tx.districtStat.upsert({
          where: { slug: b.slug },
          create: { slug: b.slug, name: b.name, boundary: b.rings },
          update: { name: b.name, boundary: b.rings },
        });
      }
    },
    { timeout: 120_000 },
  );

  console.log(`${places.length} lugares y ${boundaries.length} límites de distrito guardados.`);
  console.log('Siguiente paso: pnpm location:refresh');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
