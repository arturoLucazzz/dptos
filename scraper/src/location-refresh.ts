/**
 * pnpm location:refresh
 *
 * Loads data/location/district-stats.csv and recomputes every apartment's location
 * score and local rent. The scrape runs the same step at the end of each run.
 */

import { prisma } from '@/lib/db';
import { refreshLocations } from '@/lib/location/refresh';

refreshLocations(prisma)
  .then((counts) => {
    console.log(`Ubicación: ${counts.scored} con puntaje, ${counts.outsideLima} fuera de Lima, ${counts.noCoordinates} sin ubicación exacta.`);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
