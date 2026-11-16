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
import { finishRun, ingestCards, startRun } from './db/ingest';
import type { UrbaniaCardRaw } from './scrapers/urbania/types';
import { fromUrbaniaCard, type ListingCard, type SourceId } from '@/lib/listing-card';
import type { SourceDistrictCounts } from '@/lib/sanity-gate';

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

/**
 * A line is a `ListingCard` when it names its source. Files written before
 * there were several sources hold bare Urbania cards.
 */
function toListingCard(line: UrbaniaCardRaw | ListingCard): ListingCard {
  if ('source' in line && line.source) {
    return { ...line, districtSlug: line.districtSlug ?? districtSlugOf(line) };
  }
  return fromUrbaniaCard(line, 'urbania', districtSlugOf(line));
}

async function readCards(filePath: string): Promise<ListingCard[]> {
  const cards: ListingCard[] = [];
  const stream = createInterface({ input: createReadStream(filePath, 'utf-8'), crlfDelay: Infinity });
  for await (const line of stream) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      cards.push(toListingCard(JSON.parse(trimmed) as UrbaniaCardRaw | ListingCard));
    } catch {
      console.warn(`  skipping unparseable line in ${path.basename(filePath)}`);
    }
  }
  return cards;
}

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  const files = args.filter((arg) => !arg.startsWith('--'));

  if (files.length === 0) {
    console.log('Usage: pnpm replay [--reset] <file.ndjson> [more.ndjson ...]');
    process.exit(1);
  }

  // Read everything first, so the run can say which sources it replays, and so
  // a bad file stops the replay before --reset clears anything.
  const loaded: { file: string; operation: Operation; cards: ListingCard[] }[] = [];
  for (const file of files) {
    const operation: Operation = /_rent\b|_rent\./.test(file) ? Operation.RENT : Operation.SALE;
    loaded.push({ file, operation, cards: await readCards(file) });
  }
  const sources = [...new Set(loaded.flatMap(({ cards }) => cards.map((card) => card.source)))];

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
    sources: sources.length ? sources : ['urbania'],
    notes: `replay of ${files.length} file(s)`,
  });
  const districtCounts: SourceDistrictCounts = {};

  try {
    for (const { file, operation, cards } of loaded) {
      // Group by source and district so the ingest sees whole districts, as a
      // live run does.
      const groups = new Map<string, { source: SourceId; districtSlug: string; cards: ListingCard[] }>();
      for (const card of cards) {
        const districtSlug = card.districtSlug ?? 'unknown';
        const key = `${card.source}|${districtSlug}`;
        const group = groups.get(key) ?? { source: card.source, districtSlug, cards: [] };
        group.cards.push(card);
        groups.set(key, group);
      }

      console.log(`\n${path.basename(file)}: ${cards.length} cards, ${groups.size} district(s), ${operation}`);
      for (const { source, districtSlug, cards: districtCards } of groups.values()) {
        const result = await ingestCards({
          runId: run.id,
          source,
          districtSlug,
          operation,
          cards: districtCards,
        });
        const counts = (districtCounts[source] ??= {});
        counts[districtSlug] ??= {};
        counts[districtSlug][operation] = (counts[districtSlug][operation] ?? 0) + districtCards.length;
        console.log(
          `  ${`${source}/${districtSlug}`.padEnd(32)} ${String(districtCards.length).padStart(5)} cards` +
            `  +${result.created} new, ${result.updated} seen again, ${result.snapshots} snapshot(s)`
        );
      }
    }

    await finishRun(run.id, {
      status: ScrapeStatus.SUCCESS,
      districtCounts,
      pagesFetched: 0,
      skippedDistricts: [],
    });
    console.log(`\nReplay ${run.id} finished.`);
  } catch (error) {
    console.error(error);
    await finishRun(run.id, {
      status: ScrapeStatus.FAILED,
      districtCounts,
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
