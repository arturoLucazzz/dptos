/**
 * pnpm scrape:check <source|all> [--save]
 *
 * Reads one page per source (Lince, sale), with no database, and compares the
 * fields it fills with the saved fixtures. It answers "does this scraper still
 * work?" in seconds, after a change or when a site looks different.
 *
 * --save writes the fresh cards to data/checks/<source>-<YYYY-MM-DD>.json.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Operation } from '@/lib/generated/prisma/enums';
import type { ListingCard, SourceId } from '@/lib/listing-card';
import { checkSource, fillRates, type FillRates } from './check-report';
import { NAVENT_BASE_URL } from './sources/navent/client';
import { parseNaventPostings } from './sources/navent/parse';
import { parseNexoListPage } from './sources/nexo/parse';
import { parseProperProject } from './sources/proper/parse';
import { ADAPTERS } from './sources/registry';

const DISTRICT = 'lince';
const MAX_PAGES = 1;

const fixture = (path: string) => readFileSync(new URL(`./sources/${path}`, import.meta.url), 'utf8');

/** What each source's saved fixture fills: the shape a healthy page has. */
const BASELINES: Partial<Record<SourceId, () => FillRates>> = {
  urbania: () =>
    fillRates(
      parseNaventPostings(JSON.parse(fixture('navent/__fixtures__/urbania-lince-p1.response.json')), NAVENT_BASE_URL.urbania, 'urbania', DISTRICT).cards
    ),
  adondevivir: () =>
    fillRates(
      parseNaventPostings(
        JSON.parse(fixture('navent/__fixtures__/adondevivir-lince-p1.response.json')),
        NAVENT_BASE_URL.adondevivir,
        'adondevivir',
        DISTRICT
      ).cards
    ),
  proper: () => fillRates(parseProperProject(JSON.parse(fixture('proper/__fixtures__/santa-beatriz.json')), 'santa-beatriz')),
  nexo: () => fillRates(parseNexoListPage(fixture('nexo/__fixtures__/p1.html')).cards),
};

const pct = (share: number) => `${Math.round(share * 100)}%`;
const formatRates = (r: FillRates) =>
  `precio ${pct(r.price)} · área ${pct(r.area)} · dormitorios ${pct(r.bedrooms)} · dirección ${pct(r.address)} · coordenadas ${pct(r.coordinates)}`;

async function checkOne(source: SourceId, save: boolean): Promise<boolean> {
  if (source === 'remax') {
    console.log('remax: pendiente (Cloudflare Turnstile)');
    return true;
  }
  const factory = ADAPTERS[source as Exclude<SourceId, 'manual'>];
  const baseline = BASELINES[source];
  if (!factory || !baseline) {
    console.log(`${source}: no tiene scraper`);
    return true;
  }

  const started = Date.now();
  const cards: ListingCard[] = [];
  try {
    await factory().crawl({
      districts: [DISTRICT],
      operation: Operation.SALE,
      maxPages: MAX_PAGES,
      onBatch: async (batch) => void cards.push(...batch.cards),
    });
  } catch (error) {
    console.log(`${source}: FAIL · ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }

  const result = checkSource({ cards, baseline: baseline() });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`${source}: ${cards.length} avisos en ${seconds} s · ${formatRates(fillRates(cards))} · ${result.pass ? 'PASS' : 'FAIL'}`);
  for (const reason of result.reasons) console.log(`  - ${reason}`);

  if (save) {
    mkdirSync('data/checks', { recursive: true });
    const path = `data/checks/${source}-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(path, JSON.stringify(cards, null, 2));
    console.log(`  guardado en ${path}`);
  }
  return result.pass;
}

async function main() {
  const args = process.argv.slice(2);
  const save = args.includes('--save');
  const target = args.find((a) => !a.startsWith('--'));
  const all: SourceId[] = ['urbania', 'adondevivir', 'proper', 'nexo', 'remax'];
  if (!target || (target !== 'all' && !all.includes(target as SourceId))) {
    console.log(`Uso: pnpm scrape:check <${all.join('|')}|all> [--save]`);
    process.exitCode = 1;
    return;
  }
  const sources = target === 'all' ? all : [target as SourceId];
  let ok = true;
  for (const source of sources) ok = (await checkOne(source, save)) && ok;
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
