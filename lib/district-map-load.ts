/** Loads the /mercado district map data. Server only: kept apart from the pure helpers so client code never pulls in the database. */

import { buildDistrictFeatures, mapMetrics, nseLima, roundCoordinates, type Ring } from './district-map';

/** Everything the page needs, read once. The database modules load here so the rest stays pure. */
export async function loadDistrictMap(trackedSlugs: string[]) {
  const [{ readFile }, { prisma }, { readLatestStats }, { parseIndicators, parsePlaces }, { STATS_DIR }] = await Promise.all([
    import('node:fs/promises'),
    import('./db'),
    import('./stats/store'),
    import('./stats/files'),
    import('./stats/store'),
  ]);
  const [rows, latest, placesText, indicatorsText] = await Promise.all([
    prisma.districtStat.findMany({ select: { slug: true, name: true, boundary: true } }),
    readLatestStats(prisma),
    readFile(`${STATS_DIR}/places.csv`, 'utf8'),
    readFile(`${STATS_DIR}/indicators.csv`, 'utf8'),
  ]);
  const boundaries = rows.map((r) => ({ slug: r.slug, name: r.name, rings: (r.boundary as Ring[] | null) ?? [] }));
  const places = parsePlaces(placesText);
  return {
    features: roundCoordinates(buildDistrictFeatures(boundaries, latest, places, trackedSlugs)),
    metrics: mapMetrics(latest, parseIndicators(indicatorsText)),
    nse: nseLima(latest),
  };
}
