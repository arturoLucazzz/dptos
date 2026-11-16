import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Operation } from '@/lib/generated/prisma/enums';
import type { SourceBatch } from '../types';
import { nexoAdapter } from './adapter';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

/** Page 1 and page 2 are real; the page after them is made the last one. */
const PAGES: Record<string, string> = {
  'https://nexoinmobiliario.pe/departamentos': fixture('p1.html'),
  'https://nexoinmobiliario.pe/departamentos?page=2': fixture('p2.html'),
  'https://nexoinmobiliario.pe/departamentos?page=3': fixture('p2.html').replace('let currentPage = 2;', 'let currentPage = 33;'),
};

function adapter(pages: Record<string, string | Error>) {
  return nexoAdapter({
    wait: async () => {},
    retries: 0,
    log: () => {},
    fetchText: async (url) => {
      const page = pages[url];
      if (page === undefined || page instanceof Error) throw page ?? new Error(`HTTP 404 for ${url}`);
      return page;
    },
  });
}

async function crawl(a: ReturnType<typeof adapter>, districts = ['lince']) {
  const batches: SourceBatch[] = [];
  const result = await a.crawl({ districts, operation: Operation.SALE, onBatch: async (b) => void batches.push(b) });
  return { batches, result };
}

describe('nexoAdapter', () => {
  it('walks the pages and hands projects over under their own district', async () => {
    const { batches, result } = await crawl(adapter(PAGES));
    assert.equal(result.incomplete, false);
    const handed = batches.flatMap((b) => b.cards).length;
    // 48 on pages 1 and 2; the third page repeats page 2, so its projects are skipped.
    assert.equal(handed + result.skippedOutsideLima, 48);
    assert.ok(batches.every((b) => b.cards.every((c) => c.districtSlug === b.districtSlug)));
    assert.ok(result.skippedOutsideLima > 0);
    // The site makes no claim per district.
    assert.equal(result.districts.find((d) => d.districtSlug === 'lince')?.claimedTotal, null);
  });

  it('reports a requested district without projects as covered', async () => {
    const { result } = await crawl(adapter(PAGES), ['lince', 'san-borja', 'miraflores']);
    assert.deepEqual(result.districts.map((d) => d.districtSlug).sort(), ['jesus-maria', 'lince', 'magdalena', 'miraflores', 'pueblo-libre', 'san-borja', 'san-isidro', 'san-miguel', 'santiago-de-surco', 'surquillo']);
  });

  it('is incomplete when a page cannot be fetched', async () => {
    const { batches, result } = await crawl(adapter({ ...PAGES, 'https://nexoinmobiliario.pe/departamentos?page=2': new Error('HTTP 500') }));
    assert.equal(result.incomplete, true);
    assert.ok(batches.length > 0);
  });

  it('is incomplete when a page before the end has no cards', async () => {
    const empty = PAGES['https://nexoinmobiliario.pe/departamentos?page=2'].replace(/const projects = \[.*?\];/s, 'const projects = [];');
    const { result } = await crawl(adapter({ ...PAGES, 'https://nexoinmobiliario.pe/departamentos?page=2': empty }));
    assert.equal(result.incomplete, true);
  });

  it('stops as incomplete when the site ignores the page number', async () => {
    const same = PAGES['https://nexoinmobiliario.pe/departamentos'];
    const { result } = await crawl(adapter({ ...PAGES, 'https://nexoinmobiliario.pe/departamentos?page=2': same }));
    assert.equal(result.incomplete, true);
  });

  it('is incomplete when the paging markers vanish', async () => {
    const bare = PAGES['https://nexoinmobiliario.pe/departamentos'].replace('const totalProyectos', 'const total');
    const { result } = await crawl(adapter({ 'https://nexoinmobiliario.pe/departamentos': bare }));
    assert.equal(result.incomplete, true);
  });
});
