/**
 * pnpm stats:load
 *
 * Reads and checks the statistics files in data/stats/, replaces the Statistic table,
 * and recomputes every apartment's location score.
 */

import { prisma } from '@/lib/db';
import { refreshLocations } from '@/lib/location/refresh';
import { loadStatistics, readStatFiles, runStatsLoad, STATS_DIR } from '@/lib/stats/store';

async function main() {
  let counts: Awaited<ReturnType<typeof refreshLocations>> | null = null;
  const result = await runStatsLoad({
    read: () => readStatFiles(STATS_DIR),
    load: (rows) => loadStatistics(prisma, rows, new Date()),
    refresh: async () => {
      counts = await refreshLocations(prisma);
    },
  });
  console.log(`Estadísticas: ${result.loaded} filas cargadas.`);
  if (result.refreshError) {
    console.error(`Las estadísticas quedaron guardadas, pero el recálculo falló: ${result.refreshError}. Corre pnpm location:refresh.`);
    process.exitCode = 1;
  } else if (counts) {
    const c = counts as Awaited<ReturnType<typeof refreshLocations>>;
    console.log(`Ubicación: ${c.scored} con puntaje, ${c.outsideLima} fuera de Lima, ${c.noCoordinates} sin ubicación exacta.`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
