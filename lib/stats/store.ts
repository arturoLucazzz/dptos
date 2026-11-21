/**
 * The Statistic table mirrors the files in data/stats/. stats:load reads and checks every
 * file, replaces all rows in one transaction, then recomputes the location scores.
 *
 * Takes the client as an argument so tests can import the pure parts without a database.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '../generated/prisma/client';
import { checkUnique, parseIndicators, parsePlaces, parseStatFile, type StatRow } from './files';
import { latestStats, type LatestStat } from './latest';

export const STATS_DIR = 'data/stats';
// Not stat rows: the catalog, and the INEI strata ranges (read by lib/stats/strata.ts).
const CATALOG_FILES = new Set(['indicators.csv', 'places.csv', 'inei-estratos-2020-rangos.csv']);

/** Every data file in the directory, checked against the catalog, with no repeated rows. */
export function readStatFiles(dir: string): StatRow[] {
  const root = join(process.cwd(), dir);
  const indicators = new Set(parseIndicators(readFileSync(join(root, 'indicators.csv'), 'utf8')).map((d) => d.indicator));
  const placesPath = join(root, 'places.csv');
  const places = new Set(existsSync(placesPath) ? parsePlaces(readFileSync(placesPath, 'utf8')).map((p) => p.place) : []);
  const rows: StatRow[] = [];
  for (const file of readdirSync(root).filter((f) => f.endsWith('.csv') && !CATALOG_FILES.has(f)).sort()) {
    rows.push(...parseStatFile(file, readFileSync(join(root, file), 'utf8'), { indicators, places }));
  }
  checkUnique(rows);
  return rows;
}

export async function loadStatistics(db: PrismaClient, rows: StatRow[], loadedAt: Date): Promise<number> {
  await db.$transaction(async (tx) => {
    await tx.statistic.deleteMany();
    if (rows.length > 0) await tx.statistic.createMany({ data: rows.map((r) => ({ ...r, loadedAt })) });
  });
  return rows.length;
}

export async function readLatestStats(db: PrismaClient): Promise<Map<string, Map<string, LatestStat>>> {
  const rows = await db.statistic.findMany({ select: { place: true, indicator: true, value: true, period: true, source: true } });
  return latestStats(rows.map((r) => ({ ...r, value: Number(r.value) })));
}

/** Read and check first; a bad file loads nothing. A failed refresh keeps the load. */
export async function runStatsLoad(deps: {
  read: () => StatRow[];
  load: (rows: StatRow[]) => Promise<number>;
  refresh: () => Promise<unknown>;
}): Promise<{ loaded: number; refreshError: string | null }> {
  const rows = deps.read();
  const loaded = await deps.load(rows);
  try {
    await deps.refresh();
    return { loaded, refreshError: null };
  } catch (error) {
    return { loaded, refreshError: error instanceof Error ? error.message : String(error) };
  }
}
