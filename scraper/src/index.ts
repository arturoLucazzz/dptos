#!/usr/bin/env node

import { execSync } from 'child_process';
import { LIMA_DISTRICT_SLUGS, unknownDistrictSlugs } from './config/districts';
import { createIncrementalSink } from './utils/file-utils';
import { DataProcessor } from './processor';
import {
  finishRun,
  ingestCards,
  refreshManualPostings,
  shouldSkipDistrict,
  shouldSkipWholeSite,
  startRun,
} from './db/ingest';
import { ADAPTERS } from './sources/registry';
import { crawlIsComplete, parseAcceptGate, sourcesToRecord, type SourceOutcome } from './sources/run-sources';
import type { SourceAdapter } from './sources/types';
import { Operation, ScrapeMode, ScrapeStatus } from '@/lib/generated/prisma/enums';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { invalidateMarketCache } from '@/lib/market';
import { refreshLocations } from '@/lib/location/refresh';
import { runLocationRefresh } from './location-hook';
import type { ListingCard, SourceId } from '@/lib/listing-card';
import { WHOLE_SITE_SLICE, type GateVerdict, type SourceDistrictCounts } from '@/lib/sanity-gate';

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

/** Everything the run records, filled in by each source as it goes. */
interface RunState {
  id: string;
  dryRun: boolean;
  districtCounts: SourceDistrictCounts;
  skippedDistricts: string[];
  errors: unknown[];
  pagesFetched: number;
  blocked: boolean;
  /** Slices the sanity gate skipped, per source. */
  gatedSlices: Partial<Record<SourceId, number>>;
  /** `--accept-gate` slices, as `source:district`. */
  acceptGate: Set<string>;
}

function operationLabel(operation: Operation): 'sale' | 'rent' {
  return operation === Operation.RENT ? 'rent' : 'sale';
}

/** Says why a collapsed count was let through anyway. */
function logGateVerdict(label: string, observed: number, previousCount: number | null, verdict: GateVerdict) {
  if (verdict === 'auto-accepted') {
    console.log(
      `  ${label}: ${observed} postings against ${previousCount} last run, ` +
        `aceptado tras 3 corridas: the drop held for 3 runs in a row, so it is taken as real.`
    );
  } else if (verdict === 'manual-accepted') {
    console.log(`  ${label}: ${observed} postings against ${previousCount} last run, accepted by --accept-gate.`);
  }
}

/**
 * Crawl one source for one operation, then gate and ingest it district by district.
 * Returns whether the crawl covered every requested district.
 */
async function runSource(
  adapter: SourceAdapter,
  run: RunState,
  opts: { districts: string[]; operation: Operation }
): Promise<boolean> {
  const { operation } = opts;
  const label = operationLabel(operation);

  // The raw NDJSON is kept alongside the database rows: it is the only copy of
  // what the site actually returned, and it costs nothing.
  const sink = await createIncrementalSink(adapter.id, run.id, label);

  // Cards are buffered per district so the sanity gate can look at the whole
  // district before deciding whether to trust it.
  const pending = new Map<string, ListingCard[]>();

  console.log(`\n=== Scraping ${adapter.id} (${label}) ===`);
  let result;
  try {
    result = await adapter.crawl({
      districts: opts.districts,
      operation,
      onBatch: async (batch) => {
        await sink.append(batch.cards);
        const existing = pending.get(batch.districtSlug) ?? [];
        existing.push(...batch.cards);
        pending.set(batch.districtSlug, existing);
      },
    });
  } finally {
    // An open handle left to the garbage collector prints DEP0137 at the next source.
    await sink.close();
  }
  console.log(`Observed ${sink.count()} postings (raw copy: ${sink.path})`);
  if (result.skippedOutsideLima > 0) {
    console.log(`Skipped ${result.skippedOutsideLima} postings outside Lima`);
  }

  console.log('\nPer-district health');
  const counts = (run.districtCounts[adapter.id] ??= {});
  for (const district of result.districts) {
    counts[district.districtSlug] ??= {};
    counts[district.districtSlug][operation] = (pending.get(district.districtSlug) ?? []).length;
  }

  // A whole-site source lists every district in one crawl, so its total is what
  // a broken parser collapses; one of its districts at zero is a sold-out
  // project. It is gated once, on the total, and the verdict covers every district.
  let wholeSiteSkip = false;
  if (adapter.wholeSite) {
    const total = result.districts.reduce((sum, d) => sum + (pending.get(d.districtSlug)?.length ?? 0), 0);
    const { skip, previousCount, verdict } = await shouldSkipWholeSite(
      adapter.id,
      operation,
      total,
      run.id,
      run.acceptGate.has(`${adapter.id}:${WHOLE_SITE_SLICE}`)
    );
    logGateVerdict(`${adapter.id} total`, total, previousCount, verdict);
    if (skip) {
      run.gatedSlices[adapter.id] = (run.gatedSlices[adapter.id] ?? 0) + 1;
      run.skippedDistricts.push(`${adapter.id}:${WHOLE_SITE_SLICE}:${operation}`);
      console.log(
        `  ${adapter.id} total: ${total} postings against ${previousCount} last run. ` +
          `Treating this as a broken parser, not an empty site: no lastSeenAt touched in any district.`
      );
    }
    wholeSiteSkip = skip;
  }

  for (const district of result.districts) {
    run.pagesFetched += district.pagesFetched;
    if (district.blocked) run.blocked = true;
    if (district.errors.length) run.errors.push(...district.errors.map((e) => `${adapter.id}: ${e}`));

    const cards = pending.get(district.districtSlug) ?? [];
    let skip = wholeSiteSkip;
    if (!adapter.wholeSite) {
      const gate = await shouldSkipDistrict(
        adapter.id,
        district.districtSlug,
        operation,
        cards.length,
        run.id,
        run.acceptGate.has(`${adapter.id}:${district.districtSlug}`)
      );
      logGateVerdict(district.districtSlug, cards.length, gate.previousCount, gate.verdict);
      skip = gate.skip;
      if (skip) {
        run.gatedSlices[adapter.id] = (run.gatedSlices[adapter.id] ?? 0) + 1;
        run.skippedDistricts.push(`${adapter.id}:${district.districtSlug}:${operation}`);
        console.log(
          `  ${district.districtSlug}: ${cards.length} postings against ${gate.previousCount} last run. ` +
            `Treating this as a broken parser, not an empty district: no lastSeenAt touched.`
        );
      }
    }

    let ingestNote = '';
    if (!run.dryRun) {
      const ingested = await ingestCards({
        runId: run.id,
        source: adapter.id,
        districtSlug: district.districtSlug,
        operation,
        cards,
        touchLastSeen: !skip,
      });
      ingestNote = `  +${ingested.created} new, ${ingested.snapshots} snapshot(s)`;
    }
    console.log(
      `  ${district.districtSlug.padEnd(20)} ${String(cards.length).padStart(5)} postings` +
        `  claimed ${String(district.claimedTotal ?? '?').padStart(5)}` +
        `  ${String(district.pagesFetched).padStart(3)} pages` +
        ingestNote +
        (district.blocked ? '  BLOCKED' : '')
    );
  }

  const complete = crawlIsComplete(opts.districts, result);
  if (!complete) {
    const returned = new Set(result.districts.map((d) => d.districtSlug));
    const missing = opts.districts.filter((d) => !returned.has(d));
    run.errors.push(
      `${adapter.id} (${label}) incomplete` + (missing.length ? `: no result for ${missing.join(', ')}` : '')
    );
  }
  return complete;
}

/** The adapters to run: `--sources=a,b`, or every registered one. */
function selectAdapters(sourcesArg: string | undefined): SourceAdapter[] {
  const registered = Object.keys(ADAPTERS) as Array<keyof typeof ADAPTERS>;
  const wanted = sourcesArg ? sourcesArg.split(',').map((s) => s.trim()).filter(Boolean) : registered;
  const unknown = wanted.filter((id) => !(registered as string[]).includes(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown source(s): ${unknown.join(', ')}. Registered: ${registered.join(', ')}`);
  }
  return (wanted as Array<keyof typeof ADAPTERS>).map((id) => ADAPTERS[id]!());
}

/**
 * Run every selected source across the configured districts and persist what
 * they observe. A dry run crawls, gates and logs, and writes nothing to the
 * database; the raw NDJSON is still kept.
 */
async function runScrapers(args: string[]) {
  if (process.env.SCRAPER_ENABLED === 'false') {
    console.log('SCRAPER_ENABLED=false, nothing to do.');
    return;
  }

  const districtsArg = argValue(args, 'districts');
  const districts = districtsArg
    ? districtsArg.split(',').map((slug) => slug.trim()).filter(Boolean)
    : Array.from(LIMA_DISTRICT_SLUGS);
  const unknown = unknownDistrictSlugs(districts);
  if (unknown.length > 0) {
    // Before the run starts: a typo must not become a run that records a source.
    console.error(
      `Unknown district slug(s): ${unknown.join(', ')}. Use the slugs of LIMA_DISTRICT_SLUGS: ${LIMA_DISTRICT_SLUGS.join(', ')}`
    );
    process.exitCode = 1;
    return;
  }
  const operations = (argValue(args, 'operations') ?? 'sale,rent')
    .split(',')
    .map((op) => (op === 'rent' ? Operation.RENT : Operation.SALE));
  const mode = (argValue(args, 'mode') as ScrapeMode) ?? ScrapeMode.TARGET_DAILY;
  const dryRun = args.includes('--dry-run');
  const acceptGate = parseAcceptGate(args);
  const adapters = selectAdapters(argValue(args, 'sources'));
  const sources = adapters.map((adapter) => adapter.id);

  const runId = dryRun
    ? `dryrun-${Date.now()}`
    : (await startRun({ mode, gitSha: currentGitSha(), sources })).id;
  const run: RunState = {
    id: runId,
    dryRun,
    districtCounts: {},
    skippedDistricts: [],
    errors: [],
    pagesFetched: 0,
    blocked: false,
    gatedSlices: {},
    acceptGate,
  };
  console.log(`Run ${run.id} (${mode})${dryRun ? ' DRY RUN, nothing written to the database' : ''}`);
  console.log(`  sources: ${sources.join(', ')}`);
  console.log(`  districts: ${districts.join(', ')}`);
  console.log(`  operations: ${operations.join(', ')}`);
  if (acceptGate.size > 0) console.log(`  accept gate: ${[...acceptGate].join(', ')}`);

  // What each source did, to decide which ones the run records (see run-sources.ts).
  const outcomes: SourceOutcome[] = [];

  try {
    for (const adapter of adapters) {
      const adapterOperations = adapter.operations.filter((op) => operations.includes(op));
      let failed = false;
      for (const operation of adapterOperations) {
        try {
          const complete = await runSource(adapter, run, { districts, operation });
          if (!complete) {
            failed = true;
            console.error(`Source ${adapter.id} (${operationLabel(operation)}) stopped before every district`);
          }
        } catch (error) {
          failed = true;
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Source ${adapter.id} (${operationLabel(operation)}) failed: ${message}`);
          run.errors.push(`${adapter.id} (${operationLabel(operation)}) failed: ${message}`);
        }
      }
      outcomes.push({
        source: adapter.id,
        crawled: adapterOperations.length > 0,
        failed,
        gatedSlices: run.gatedSlices[adapter.id] ?? 0,
      });
    }

    const { recorded, leftOut } = sourcesToRecord(outcomes);
    console.log(`\nSources recorded on the run: ${recorded.join(', ') || 'none'}`);
    for (const { source, reason } of leftOut) {
      console.log(`  ${source} left out (${reason}): this run does not age its listings or set its gate baseline`);
    }

    // A run with no sources would read as an old Urbania run, so a run that
    // records none is a failure, not a partial success.
    const status =
      recorded.length === 0
        ? ScrapeStatus.FAILED
        : run.blocked || run.errors.length > 0 || run.skippedDistricts.length > 0
          ? ScrapeStatus.PARTIAL
          : ScrapeStatus.SUCCESS;

    // Said on the run too, so /runs can explain a FAILED or PARTIAL badge.
    for (const { source, reason } of leftOut) run.errors.push(`${source} not recorded on the run: ${reason}`);
    if (recorded.length === 0) run.errors.push('no source recorded');

    if (!dryRun) {
      if (status !== ScrapeStatus.FAILED) {
        const refreshed = await refreshManualPostings(new Date());
        if (refreshed > 0) console.log(`\nKept ${refreshed} manual listing(s) live`);
      }
      await finishRun(run.id, {
        status,
        districtCounts: run.districtCounts,
        pagesFetched: run.pagesFetched,
        skippedDistricts: run.skippedDistricts,
        errors: run.errors.length ? run.errors : undefined,
        sources: recorded,
      });
      invalidateMarketCache();
      // After finishRun, so this run counts in the possibly-sold cutoffs. A failed
      // refresh keeps the old scores and never fails the scrape.
      const counts = await runLocationRefresh(
        () => refreshLocations(prisma),
        async (message) => {
          run.errors.push(message);
          await prisma.scrapeRun.update({ where: { id: run.id }, data: { errors: run.errors as Prisma.InputJsonValue } });
        },
      );
      if (counts) {
        console.log(`\nLocation: ${counts.scored} scored, ${counts.outsideLima} outside Lima, ${counts.noCoordinates} without coordinates`);
      }
    }
    console.log(`\nRun ${run.id} finished: ${status}`);
    if (status === ScrapeStatus.FAILED) process.exitCode = 1;
  } catch (error) {
    console.error('Run failed:', error);
    if (!dryRun) {
      await finishRun(run.id, {
        status: ScrapeStatus.FAILED,
        districtCounts: run.districtCounts,
        pagesFetched: run.pagesFetched,
        skippedDistricts: run.skippedDistricts,
        errors: [...run.errors, error instanceof Error ? error.message : String(error)],
        sources: sourcesToRecord(outcomes).recorded,
      });
    }
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
  pnpm scrape                                   - Scrape every source and district, sale and rent
  pnpm scrape --sources=urbania                 - Only these sources (default: every registered one)
  pnpm scrape --districts=lince,surquillo       - Only these districts
  pnpm scrape --operations=sale                 - Only one operation
  pnpm scrape --mode=FULL_WEEKLY                - Label the run (TARGET_DAILY | FULL_WEEKLY | MANUAL)
  pnpm scrape --dry-run                         - Crawl and log, write nothing to the database
  pnpm scrape --accept-gate=urbania:lince       - Accept a sanity-gate drop for this run (repeat or comma list)
  pnpm scrape --accept-gate=proper:all          - Same for a whole-site source (proper, nexo), gated on its total
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
