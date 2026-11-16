/**
 * Re-ingest the raw NDJSON a run wrote, without touching the network.
 *
 * The raw cards are the only record of what the site actually returned, so when
 * the ingest logic changes (a better property matcher, a new quality flag) the
 * history can be rebuilt from them instead of waiting weeks to re-observe it.
 *
 *   pnpm replay data/runs/urbania_<runId>_sale.ndjson
 *   pnpm replay --reset data/runs/*.ndjson
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import { prisma } from '@/lib/db';
import { Operation, ScrapeMode, ScrapeStatus } from '@/lib/generated/prisma/enums';
import { finishRun, ingestCards, startRun, type DistrictCounts } from './db/ingest';
import type { UrbaniaCardRaw } from './scrapers/urbania/types';
import { fromUrbaniaCard } from '@/lib/listing-card';

async function readCards(filePath: string): Promise<UrbaniaCardRaw[]> {
  const cards: UrbaniaCardRaw[] = [];
  const stream = createInterface({ input: createReadStream(filePath, 'utf-8'), crlfDelay: Infinity });
  for await (const line of stream) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      cards.push(JSON.parse(trimmed) as UrbaniaCardRaw);
    } catch {
      console.warn(`  skipping unparseable line in ${path.basename(filePath)}`);
    }
  }
  return cards;
}

/** District slug from the card's own location tree, which beats the file name. */
function districtSlugOf(card: UrbaniaCardRaw): string {
  const name = card.districtName ?? 'unknown';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  const files = args.filter((arg) => !arg.startsWith('--'));

  if (files.length === 0) {
    console.log('Usage: pnpm replay [--reset] <file.ndjson> [more.ndjson ...]');
    process.exit(1);
  }

  if (reset) {
    // Order matters: the snapshot pointer on Posting has to go before the rows it
    // points at.
    await prisma.posting.updateMany({ data: { currentSnapshotId: null } });
    await prisma.postingSnapshot.deleteMany();
    await prisma.posting.deleteMany();
    await prisma.property.deleteMany();
    console.log('Cleared postings, snapshots and properties.');
  }

  const run = await startRun({
    mode: ScrapeMode.MANUAL,
    sources: ['urbania'],
    notes: `replay of ${files.length} file(s)`,
  });
  const districtCounts: DistrictCounts = {};

  try {
    for (const file of files) {
      const cards = await readCards(file);
      const operation: Operation = /_rent\b|_rent\./.test(file) ? Operation.RENT : Operation.SALE;

      // Group by district so the ingest sees whole districts, as a live run does.
      const byDistrict = new Map<string, UrbaniaCardRaw[]>();
      for (const card of cards) {
        const slug = districtSlugOf(card);
        const list = byDistrict.get(slug) ?? [];
        list.push(card);
        byDistrict.set(slug, list);
      }

      console.log(`\n${path.basename(file)}: ${cards.length} cards, ${byDistrict.size} district(s), ${operation}`);
      for (const [districtSlug, districtCards] of byDistrict) {
        const result = await ingestCards({
          runId: run.id,
          source: 'urbania',
          districtSlug,
          operation,
          cards: districtCards.map((card) => fromUrbaniaCard(card, 'urbania', districtSlug)),
        });
        districtCounts[districtSlug] ??= {};
        districtCounts[districtSlug][operation] = districtCards.length;
        console.log(
          `  ${districtSlug.padEnd(20)} ${String(districtCards.length).padStart(5)} cards` +
            `  +${result.created} new, ${result.updated} seen again, ${result.snapshots} snapshot(s)`
        );
      }
    }

    await finishRun(run.id, {
      status: ScrapeStatus.SUCCESS,
      districtCounts: { urbania: districtCounts },
      pagesFetched: 0,
      skippedDistricts: [],
    });
    console.log(`\nReplay ${run.id} finished.`);
  } catch (error) {
    console.error(error);
    await finishRun(run.id, {
      status: ScrapeStatus.FAILED,
      districtCounts: { urbania: districtCounts },
      pagesFetched: 0,
      skippedDistricts: [],
      errors: [error instanceof Error ? error.message : String(error)],
    });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
