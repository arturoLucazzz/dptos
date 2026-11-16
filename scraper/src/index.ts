#!/usr/bin/env node

import { execSync } from 'child_process';
import { ScraperFilters } from './types/index';
import { LIMA_DISTRICT_SLUGS } from './config/districts';
import { UrbaniaScraper } from './scrapers/urbania-scraper';
import type { UrbaniaCardRaw } from './scrapers/urbania/types';
import { createIncrementalSink } from './utils/file-utils';
import { DataProcessor } from './processor';
import {
  finishRun,
  ingestCards,
  shouldSkipDistrict,
  startRun,
  type DistrictCounts,
} from './db/ingest';
import { Operation, ScrapeMode, ScrapeStatus } from '@/lib/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { invalidateMarketCache } from '@/lib/market';
import { fromUrbaniaCard } from '@/lib/listing-card';

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'scrape':
      await runScrapers(args.slice(1));
      break;

    case 'process':
      await processResults(args[1]);
      break;

    case 'help':
    default:
      showHelp();
      break;
  }
}

function argValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

/** Commit the worker is running, so every row can be traced back to its code. */
function currentGitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Run the scrapers across the configured districts and persist what they observe.
 */
async function runScrapers(args: string[]) {
  if (process.env.SCRAPER_ENABLED === 'false') {
    console.log('SCRAPER_ENABLED=false, nothing to do.');
    return;
  }

  const districtsArg = argValue(args, 'districts');
  const districts = districtsArg ? districtsArg.split(',') : Array.from(LIMA_DISTRICT_SLUGS);
  const operations = (argValue(args, 'operations') ?? 'sale,rent').split(',') as Array<'sale' | 'rent'>;
  const mode = (argValue(args, 'mode') as ScrapeMode) ?? ScrapeMode.TARGET_DAILY;
  const dryRun = args.includes('--dry-run');

  const run = await startRun({ mode, gitSha: currentGitSha(), sources: ['urbania'] });
  console.log(`Run ${run.id} (${mode})${dryRun ? ' DRY RUN, nothing written' : ''}`);
  console.log(`  districts: ${districts.join(', ')}`);
  console.log(`  operations: ${operations.join(', ')}`);

  const districtCounts: DistrictCounts = {};
  const skippedDistricts: string[] = [];
  const runErrors: unknown[] = [];
  let pagesFetched = 0;
  let blockedAnywhere = false;

  try {
    for (const operationArg of operations) {
      const operation = operationArg === 'rent' ? Operation.RENT : Operation.SALE;

      // No bedroom filter: the whole district is wanted, and narrowing it also
      // narrows the comparables the fair-price model can use later.
      const filters: ScraperFilters = {
        propertyType: 'apartment',
        operationType: operationArg,
        districts,
        city: 'Lima',
        sort: 'priceAsc',
      };

      // The raw NDJSON is kept alongside the database rows: it is the only copy of
      // what the site actually returned, and it costs nothing.
      const sink = await createIncrementalSink(`${run.id}_${operationArg}`, 'urbania');

      // Cards are buffered per district so the sanity gate can look at the whole
      // district before deciding whether to trust it.
      const pending = new Map<string, UrbaniaCardRaw[]>();

      const scraper = new UrbaniaScraper({
        engine: (process.env.SCRAPER_ENGINE as 'playwright' | 'puppeteer') || 'playwright',
        onBatch: async (batch) => {
          await sink.append(batch.cards);
          const existing = pending.get(batch.districtSlug) ?? [];
          existing.push(...batch.cards);
          pending.set(batch.districtSlug, existing);
        },
      });

      console.log(`\n=== Scraping ${scraper.getName()} (${operationArg}) ===`);
      const result = await scraper.scrape(filters);
      console.log(`Observed ${result.totalResults} postings (raw copy: ${sink.path})`);

      console.log('\nPer-district health');
      for (const district of scraper.districtResults) {
        pagesFetched += district.pagesFetched;
        if (district.blocked) blockedAnywhere = true;
        if (district.errors.length) runErrors.push(...district.errors);

        const cards = pending.get(district.districtSlug) ?? [];
        districtCounts[district.districtSlug] ??= {};
        districtCounts[district.districtSlug][operation] = cards.length;

        const { skip, previousCount } = await shouldSkipDistrict(
          'urbania',
          district.districtSlug,
          operation,
          cards.length,
          run.id
        );
        if (skip) {
          skippedDistricts.push(`${district.districtSlug}:${operation}`);
          console.log(
            `  ${district.districtSlug}: ${cards.length} postings against ${previousCount} last run. ` +
              `Treating this as a broken parser, not an empty district: no lastSeenAt touched.`
          );
        }

        if (!dryRun) {
          const ingested = await ingestCards({
            runId: run.id,
            source: 'urbania',
            districtSlug: district.districtSlug,
            operation,
            cards: cards.map((card) => fromUrbaniaCard(card, 'urbania', district.districtSlug)),
            touchLastSeen: !skip,
          });
          console.log(
            `  ${district.districtSlug.padEnd(20)} ${String(cards.length).padStart(5)} postings` +
              `  claimed ${String(district.claimedTotal ?? '?').padStart(5)}` +
              `  ${String(district.pagesFetched).padStart(3)} pages` +
              `  ${district.bands.length} band(s)` +
              `  +${ingested.created} new, ${ingested.snapshots} snapshot(s)` +
              (district.blocked ? '  BLOCKED' : '')
          );
        }
      }

      if (result.metadata?.errors?.length) {
        runErrors.push(...result.metadata.errors);
      }
    }

    const status =
      blockedAnywhere || runErrors.length > 0 || skippedDistricts.length > 0
        ? ScrapeStatus.PARTIAL
        : ScrapeStatus.SUCCESS;
    await finishRun(run.id, {
      status,
      districtCounts: { urbania: districtCounts },
      pagesFetched,
      skippedDistricts,
      errors: runErrors.length ? runErrors : undefined,
    });
    console.log(`\nRun ${run.id} finished: ${status}`);
    invalidateMarketCache();
  } catch (error) {
    console.error('Run failed:', error);
    await finishRun(run.id, {
      status: ScrapeStatus.FAILED,
      districtCounts: { urbania: districtCounts },
      pagesFetched,
      skippedDistricts,
      errors: [...runErrors, error instanceof Error ? error.message : String(error)],
    });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Process scraped results
 */
async function processResults(filename?: string) {
  const processor = new DataProcessor();

  if (filename) {
    await processor.processFile(filename);
  } else {
    await processor.processAll();
  }
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Real Estate Scraper

Usage:
  pnpm scrape                                   - Scrape every configured district, sale and rent
  pnpm scrape --districts=lince,surquillo       - Only these districts
  pnpm scrape --operations=sale                 - Only one operation
  pnpm scrape --mode=FULL_WEEKLY                - Label the run (TARGET_DAILY | FULL_WEEKLY | MANUAL)
  pnpm scrape --dry-run                         - Crawl and log, write nothing to the database
  pnpm scrape:probe --district=lince --pages=2  - Parse-quality report, writes nothing
  pnpm process [file]                           - Process legacy JSON result files

Environment:
  SCRAPER_ENABLED=false      Skip the run entirely, without touching launchd
  SCRAPER_ENGINE=puppeteer   Use Puppeteer instead of Playwright
  SCRAPER_HEADLESS=1         Run headless (Urbania answers 403 to headless Chromium)
  PLAYWRIGHT_CHANNEL=chrome  Pin a browser channel instead of trying chrome then chromium
  MAX_PAGES_PER_BAND=8       Pages a query may need before it is split into price bands
  SANITY_GATE_RATIO=0.2      Share of the previous count below which a district is distrusted
  BLOCK_RESOURCES=0          Stop aborting images, fonts and analytics
`);
}

// Run main function
main().catch(console.error);
