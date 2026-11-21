/** Loads the /mercado district map data. Server only: kept apart from the pure helpers so client code never pulls in the database. */

import { buildDistrictFeatures, mapMetrics, nseLima, nseSource, roundCoordinates, type Ring } from './district-map';

type DistrictMapData = Awaited<ReturnType<typeof loadDistrictMapUncached>>;
const MAP_TTL_MS = 3600 * 1000;
const mapHolder = globalThis as unknown as { __districtMapMemo?: { key: string; at: number; value: Promise<DistrictMapData> } };

/** Memoized by the tracked-district key: boundaries and statistics rarely change, so most page loads skip the reads. */
export function loadDistrictMap(trackedSlugs: string[]): Promise<DistrictMapData> {
  const key = [...trackedSlugs].sort().join(',');
  const memo = mapHolder.__districtMapMemo;
  if (memo && memo.key === key && Date.now() - memo.at < MAP_TTL_MS) return memo.value;
  const entry = { key, at: Date.now(), value: loadDistrictMapUncached(trackedSlugs) };
  mapHolder.__districtMapMemo = entry;
  entry.value.catch(() => {
    if (mapHolder.__districtMapMemo === entry) mapHolder.__districtMapMemo = undefined;
  });
  return entry.value;
}

/** Everything the page needs, read once. The database modules load here so the rest stays pure. */
async function loadDistrictMapUncached(trackedSlugs: string[]) {
  const [{ readFile }, { prisma }, { readLatestStats }, { parseIndicators, parsePlaces }, { STATS_DIR }, { parseStrataRanges, STRATA_RANGES_FILE }] =
    await Promise.all([
      import('node:fs/promises'),
      import('./db'),
      import('./stats/store'),
      import('./stats/files'),
      import('./stats/store'),
      import('./stats/strata'),
    ]);
  const [rows, latest, placesText, indicatorsText, rangesText] = await Promise.all([
    prisma.districtStat.findMany({ select: { slug: true, name: true, boundary: true } }),
    readLatestStats(prisma),
    readFile(`${STATS_DIR}/places.csv`, 'utf8'),
    readFile(`${STATS_DIR}/indicators.csv`, 'utf8'),
    readFile(`${STATS_DIR}/${STRATA_RANGES_FILE}`, 'utf8'),
  ]);
  const boundaries = rows.map((r) => ({ slug: r.slug, name: r.name, rings: (r.boundary as Ring[] | null) ?? [] }));
  const places = parsePlaces(placesText);
  return {
    features: roundCoordinates(buildDistrictFeatures(boundaries, latest, places, trackedSlugs)),
    metrics: mapMetrics(latest, parseIndicators(indicatorsText)),
    nse: nseLima(latest),
    nseSource: nseSource(latest),
    strataRanges: parseStrataRanges(rangesText),
  };
}
