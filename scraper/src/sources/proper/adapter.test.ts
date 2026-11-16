import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Operation } from '@/lib/generated/prisma/enums';
import type { SourceBatch } from '../types';
import { PROPER_LIST_URL, properAdapter } from './adapter';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

const LIST = JSON.stringify([
  { slug: 'santa-beatriz', distrito: 'cercado de lima' },
  { slug: 'jazmines', distrito: 'lince' },
  { slug: 'broken', distrito: 'lince' },
  { slug: 'el-sol-1202', distrito: 'lince', tipo: 'departamento alquiler' },
]);

function detail(distrito: string): string {
  const json = JSON.parse(fixture('santa-beatriz.json'));
  json.pageProps.props.proyecto.distrito = distrito;
  return JSON.stringify(json);
}

function unitInLince() {
  const json = JSON.parse(fixture('el-sol-1202.json'));
  json.pageProps.props.departamento.distrito = 'lince';
  return json;
}

function adapter(failing: string[] = []) {
  return properAdapter({
    wait: async () => {},
    retries: 0,
    log: () => {},
    fetchText: async (url) => {
      if (url === PROPER_LIST_URL) return LIST;
      if (url.endsWith('/propiedades')) return fixture('propiedades.html');
      if (failing.some((slug) => url.includes(`/${slug}.json`))) throw new Error('HTTP 500');
      if (url.includes('/entrega-inmediata/el-sol-1202.json')) return JSON.stringify(unitInLince());
      if (url.includes('/santa-beatriz.json')) return detail('cercado de lima');
      return detail('lince');
    },
  });
}

async function crawl(a: ReturnType<typeof adapter>, districts = ['lince']) {
  const batches: SourceBatch[] = [];
  const result = await a.crawl({ districts, operation: Operation.SALE, onBatch: async (b) => void batches.push(b) });
  return { batches, result };
}

describe('properAdapter', () => {
  it('hands each project over under its district, project card first', async () => {
    const { batches, result } = await crawl(adapter(['broken']));
    const lince = batches.filter((b) => b.districtSlug === 'lince');
    assert.equal(lince.length, 2);
    assert.equal(lince[0].cards[0].kind, 'PROJECT');
    assert.equal(lince[0].cards.length, 10);
    assert.equal(lince[1].cards.length, 1);
    assert.equal(lince[1].cards[0].sourcePostingId, 'el-sol-1202');
    assert.equal(result.skippedOutsideLima, 10);
  });

  it('flags the crawl incomplete when a project detail fails', async () => {
    const { result } = await crawl(adapter(['broken']));
    assert.equal(result.incomplete, true);
    assert.match(result.districts.find((d) => d.districtSlug === 'lince')!.errors[0], /broken/);
  });

  it('returns an empty result for a requested district without projects', async () => {
    const { result } = await crawl(adapter(), ['miraflores']);
    assert.ok(result.districts.some((d) => d.districtSlug === 'miraflores'));
  });

  it('does nothing for rent', async () => {
    const result = await adapter().crawl({ districts: ['lince'], operation: Operation.RENT, onBatch: async () => {} });
    assert.deepEqual(result, { districts: [], skippedOutsideLima: 0, incomplete: false });
  });
});
