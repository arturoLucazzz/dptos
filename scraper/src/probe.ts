/**
 * Parse-quality probe. Fetches a couple of pages, writes nothing to the database,
 * saves the raw HTML and prints a report.
 *
 * This is the feedback loop that has to work before anything is built on top of
 * the parser: if 30% of the prices are being dropped, that should be visible in
 * two minutes rather than ten phases later.
 *
 *   pnpm scrape:probe --district=lince --pages=2 --operation=sale
 *   pnpm scrape:probe --html=scraper/examples/urbania.html
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createBrowserLoader, type BrowserEngine } from './utils/browser-loader';
import { buildUrbaniaSearchUrl } from './scrapers/urbania/build-search-url';
import {
  parseUrbaniaSearchPage,
  type UrbaniaCardRaw,
  type UrbaniaPageParse,
} from './scrapers/urbania/parse-urbania-page';
import { classifyPage, type PageOutcome } from './scrapers/urbania/classify-page';
import { toPen } from '@/lib/money';
import type { ScraperFilters } from './types/index';

const BASE_URL = 'https://urbania.pe';
const PROBE_DIR = path.join(process.cwd(), 'data', 'probe');

interface ProbeOptions {
  district: string;
  pages: number;
  operation: 'sale' | 'rent';
  minPrice: number | null;
  maxPrice: number | null;
  htmlFile: string | null;
  engine: BrowserEngine;
}

function parseArgs(argv: string[]): ProbeOptions {
  const get = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const hit = argv.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : undefined;
  };

  const number = (name: string): number | null => {
    const raw = get(name);
    return raw == null ? null : Number(raw);
  };

  const operation = get('operation') === 'rent' ? 'rent' : 'sale';
  return {
    district: get('district') || 'lince',
    pages: Math.max(1, Number(get('pages') || 2)),
    operation,
    minPrice: number('minPrice'),
    maxPrice: number('maxPrice'),
    htmlFile: get('html') || null,
    engine: (get('engine') as BrowserEngine) || (process.env.SCRAPER_ENGINE as BrowserEngine) || 'playwright',
  };
}

interface PageProbe {
  page: number;
  url: string;
  status: number | null;
  outcome: PageOutcome;
  parse: UrbaniaPageParse;
  elapsedMs: number;
  savedHtmlPath: string | null;
}

function pct(n: number, total: number): string {
  if (total === 0) return '  n/a';
  return `${((n / total) * 100).toFixed(0).padStart(3)}%`;
}

function countBy<T>(items: T[], key: (item: T) => string | null): [string, number][] {
  // Plain object + Object.entries so this does not depend on downlevelIteration /
  // Map for-of, which an orphan editor project (no local tsconfig) would flag.
  const out: Record<string, number> = Object.create(null);
  for (const item of items) {
    const k = key(item) ?? '(none)';
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

function line(label: string, count: number, total: number): string {
  return `  ${label.padEnd(34)} ${String(count).padStart(4)} / ${String(total).padStart(4)}  ${pct(count, total)}`;
}

function currencyBucket(card: UrbaniaCardRaw): string {
  const hasPen = card.pricePenShown != null;
  const hasUsd = card.priceUsdShown != null;
  if (hasPen && hasUsd) return 'both PEN and USD shown';
  if (hasPen) return 'PEN only';
  if (hasUsd) return 'USD only';
  return 'no price';
}

function reportCards(title: string, cards: UrbaniaCardRaw[]): void {
  const n = cards.length;
  console.log(`\n${title} (${n} cards)`);
  if (n === 0) return;

  const units = cards.filter((c) => c.kind === 'UNIT');
  const projects = cards.filter((c) => c.kind === 'PROJECT');

  console.log('\n  Identity');
  console.log(line('with numeric posting id', cards.filter((c) => c.sourcePostingId).length, n));
  console.log(line('with slug path', cards.filter((c) => c.sourcePath).length, n));
  const uniqueIds = new Set(cards.map((c) => c.sourcePostingId).filter(Boolean)).size;
  console.log(`  ${'distinct posting ids'.padEnd(34)} ${String(uniqueIds).padStart(4)}`);

  console.log('\n  Kind');
  console.log(line('UNIT (/inmueble/clasificado/)', units.length, n));
  console.log(line('PROJECT (/inmueble/proyecto/)', projects.length, n));
  console.log(line('price is a "desde" lower bound', cards.filter((c) => c.priceIsFrom).length, n));

  console.log('\n  Price');
  console.log(line('with a parsed price', cards.filter((c) => c.priceAmount != null).length, n));
  for (const [bucket, count] of countBy(cards, currencyBucket)) {
    console.log(line(`  ${bucket}`, count, n));
  }

  console.log('\n  Features');
  console.log(line('total area (m² tot.)', cards.filter((c) => c.areaTotal != null).length, n));
  console.log(line('covered area (m² útil)', cards.filter((c) => c.areaCovered != null).length, n));
  console.log(line('area range (projects)', cards.filter((c) => c.areaMin != null).length, n));
  console.log(line('bedrooms', cards.filter((c) => c.bedrooms != null).length, n));
  console.log(line('bedroom range (projects)', cards.filter((c) => c.bedroomsMin != null).length, n));
  console.log(line('bathrooms', cards.filter((c) => c.bathrooms != null).length, n));
  console.log(line('parking spots', cards.filter((c) => c.parkingSpots != null).length, n));
  console.log(line('maintenance fee', cards.filter((c) => c.maintenanceAmount != null).length, n));
  console.log(line('antiquity in years', cards.filter((c) => c.antiquityYears != null).length, n));
  console.log(line('unit count (projects)', cards.filter((c) => c.unitsCount != null).length, n));
  console.log(line('development stage', cards.filter((c) => c.developmentStage).length, n));

  console.log('\n  Location and publisher');
  console.log(line('district from location tree', cards.filter((c) => c.districtName).length, n));
  console.log(line('sub-zone', cards.filter((c) => c.subzoneName).length, n));
  console.log(line('street address', cards.filter((c) => c.address).length, n));
  console.log(line('latitude/longitude', cards.filter((c) => c.latitude != null).length, n));
  console.log(line('publisher id', cards.filter((c) => c.publisherId).length, n));
  console.log(line('publisher listing code', cards.filter((c) => c.postingCode).length, n));

  console.log('\n  Platform metadata');
  console.log(line('operation known', cards.filter((c) => c.operation).length, n));
  console.log(line('first date online', cards.filter((c) => c.firstDateOnline).length, n));
  console.log(line('last modified date', cards.filter((c) => c.modifiedDate).length, n));
  console.log(line('flagged as duplicated', cards.filter((c) => c.hasDuplicate === true).length, n));
  for (const [operation, count] of countBy(cards, (c) => c.operation)) {
    console.log(line(`  operation ${operation}`, count, n));
  }
  for (const [type, count] of countBy(cards, (c) => c.realEstateType)) {
    console.log(line(`  type ${type}`, count, n));
  }

  console.log('\n  Slug prefix distribution');
  for (const [prefix, count] of countBy(cards, (c) => c.slugPrefix)) {
    console.log(line(`  ${prefix}`, count, n));
  }

  // The slug carries Urbania's own parse of the bedroom count, so disagreement
  // means one of the two readings is wrong and it costs nothing to check.
  const comparable = cards.filter((c) => c.slugBedrooms != null && c.bedrooms != null);
  const mismatched = comparable.filter((c) => c.slugBedrooms !== c.bedrooms);
  console.log('\n  Cross-check against the slug');
  console.log(line('bedrooms comparable', comparable.length, n));
  console.log(line('bedrooms disagree with slug', mismatched.length, comparable.length));
  for (const c of mismatched.slice(0, 5)) {
    console.log(`      id ${c.sourcePostingId}: slug says ${c.slugBedrooms}, features say ${c.bedrooms}`);
  }

  const unitAreas = units.map((c) => c.areaTotal ?? c.areaCovered).filter((a): a is number => a != null);
  if (unitAreas.length) {
    const sorted = [...unitAreas].sort((a, b) => a - b);
    console.log(
      `\n  Unit area m²: min ${sorted[0]}, median ${sorted[Math.floor(sorted.length / 2)]}, max ${sorted[sorted.length - 1]}`
    );
  }
  const unitPrices = units
    .map((c) => toPen(c.priceAmount, c.priceCurrency))
    .filter((p): p is number => p != null);
  if (unitPrices.length) {
    const sorted = [...unitPrices].sort((a, b) => a - b);
    console.log(
      `  Unit price PEN: min ${sorted[0].toLocaleString()}, median ${sorted[Math.floor(sorted.length / 2)].toLocaleString()}, max ${sorted[sorted.length - 1].toLocaleString()}`
    );
  }
}

/** With sort=priceAsc a later page must not be cheaper than an earlier one. */
function reportSortOrder(probes: PageProbe[]): void {
  const sequence: number[] = [];
  for (const probe of probes) {
    for (const card of probe.parse.cards) {
      if (card.kind !== 'UNIT') continue;
      const pen = toPen(card.priceAmount, card.priceCurrency);
      if (pen != null) sequence.push(pen);
    }
  }
  if (sequence.length < 2) return;
  let inversions = 0;
  for (let i = 1; i < sequence.length; i++) {
    if (sequence[i] < sequence[i - 1]) inversions++;
  }
  console.log('\nPrice ordering (sort=low_price)');
  console.log(line('descending steps in sequence', inversions, sequence.length - 1));
  console.log(
    `  ${'first / last unit price'.padEnd(34)} ${sequence[0].toLocaleString()} / ${sequence[sequence.length - 1].toLocaleString()}`
  );
  if (inversions > sequence.length * 0.1) {
    console.log('  WARNING: prices are not ascending, so sort=low_price is not being applied.');
  }
}

/**
 * Price banding is only a valid technique if the band parameters are actually
 * honoured, so the probe checks rather than assumes.
 */
function reportBand(probes: PageProbe[], options: ProbeOptions): void {
  if (options.minPrice == null && options.maxPrice == null) return;
  const units = probes.flatMap((p) => p.parse.cards).filter((c) => c.kind === 'UNIT');
  const prices = units
    .map((c) => ({ id: c.sourcePostingId, pen: toPen(c.priceAmount, c.priceCurrency) }))
    .filter((p): p is { id: string | null; pen: number } => p.pen != null);
  const outside = prices.filter(
    (p) =>
      (options.minPrice != null && p.pen < options.minPrice) ||
      (options.maxPrice != null && p.pen > options.maxPrice)
  );
  console.log(`\nPrice band [${options.minPrice ?? '-'} .. ${options.maxPrice ?? '-'}] PEN`);
  console.log(line('unit prices outside the band', outside.length, prices.length));
  for (const p of outside.slice(0, 5)) {
    console.log(`      id ${p.id}: ${p.pen.toLocaleString()}`);
  }
  if (outside.length > prices.length * 0.1) {
    console.log('  WARNING: the band parameters are being ignored.');
  }
}

function reportOverlap(probes: PageProbe[]): void {
  if (probes.length < 2) return;
  const seen = new Map<string, number>();
  let repeated = 0;
  let total = 0;
  for (const probe of probes) {
    for (const card of probe.parse.cards) {
      if (!card.sourcePostingId) continue;
      total++;
      if (seen.has(card.sourcePostingId)) repeated++;
      else seen.set(card.sourcePostingId, probe.page);
    }
  }
  console.log('\nPagination');
  console.log(line('ids repeated across pages', repeated, total));
  if (repeated > 0) {
    console.log('  Repeats mean the result set shifted between page loads (pagination drift).');
  }
}

function sampleCards(cards: UrbaniaCardRaw[]): void {
  const units = cards.filter((c) => c.kind === 'UNIT');
  const projects = cards.filter((c) => c.kind === 'PROJECT');
  const picks = [...units.slice(0, 2), ...projects.slice(0, 1)];
  console.log('\nFully parsed samples');
  for (const card of picks) {
    console.log(`\n${JSON.stringify({ ...card, pricePen: toPen(card.priceAmount, card.priceCurrency) }, null, 2)}`);
  }
}

async function loadPages(options: ProbeOptions): Promise<PageProbe[]> {
  if (options.htmlFile) {
    const html = await fs.readFile(options.htmlFile, 'utf-8');
    const parse = parseUrbaniaSearchPage(html, BASE_URL);
    return [
      {
        page: 1,
        url: options.htmlFile,
        status: 200,
        outcome: classifyPage({ status: 200, html, parse }),
        parse,
        elapsedMs: 0,
        savedHtmlPath: null,
      },
    ];
  }

  const filters: ScraperFilters = {
    propertyType: 'apartment',
    operationType: options.operation,
    district: options.district,
    city: 'Lima',
    sort: 'priceAsc',
    minPrice: options.minPrice ?? undefined,
    maxPrice: options.maxPrice ?? undefined,
  };

  await fs.mkdir(PROBE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const loader = await createBrowserLoader(BASE_URL, options.engine);
  const probes: PageProbe[] = [];

  try {
    for (let page = 1; page <= options.pages; page++) {
      const url = buildUrbaniaSearchUrl(filters, page);
      const startedAt = Date.now();
      console.log(`GET ${url}`);
      const { html, status } = await loader.load(url);
      const elapsedMs = Date.now() - startedAt;

      const savedHtmlPath = path.join(
        PROBE_DIR,
        `${options.district}-${options.operation}-p${page}-${stamp}.html`
      );
      await fs.writeFile(savedHtmlPath, html, 'utf-8');

      const parse = parseUrbaniaSearchPage(html, BASE_URL);
      probes.push({
        page,
        url,
        status,
        outcome: classifyPage({ status, html, parse }),
        parse,
        elapsedMs,
        savedHtmlPath,
      });

      if (probes[probes.length - 1].outcome.kind !== 'RESULTS') break;
    }
  } finally {
    await loader.close();
  }

  return probes;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log('Urbania parse probe');
  console.log(
    options.htmlFile
      ? `  source: ${options.htmlFile}`
      : `  district: ${options.district}   operation: ${options.operation}   pages: ${options.pages}   engine: ${options.engine}`
  );

  const probes = await loadPages(options);

  console.log('\nPages');
  for (const probe of probes) {
    const outcome =
      probe.outcome.kind === 'BLOCKED'
        ? `BLOCKED (${probe.outcome.reason})`
        : probe.outcome.kind;
    console.log(
      `  page ${probe.page}  HTTP ${probe.status ?? '?'}  ${outcome.padEnd(22)}` +
        `  via ${probe.parse.source.padEnd(5)}` +
        `  results ${String(probe.parse.cards.length).padStart(3)}` +
        `  carousel ${String(probe.parse.recommendations.length).padStart(3)}` +
        `  claimed total ${probe.parse.totalResults ?? '?'}` +
        `  of ${probe.parse.totalPages ?? '?'} pages` +
        `  ${(probe.elapsedMs / 1000).toFixed(1)}s`
    );
    if (probe.savedHtmlPath) console.log(`           html: ${probe.savedHtmlPath}`);
  }

  const cards = probes.flatMap((p) => p.parse.cards);
  const recommendations = probes.flatMap((p) => p.parse.recommendations);

  reportCards('Search results', cards);
  if (recommendations.length) {
    reportCards('Recommendations carousel (excluded from results)', recommendations);
  }
  reportSortOrder(probes);
  reportBand(probes, options);
  reportOverlap(probes);
  sampleCards(cards);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
