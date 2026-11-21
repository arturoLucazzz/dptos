import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Operation } from '@/lib/generated/prisma/enums';
import type { SourceBatch } from '../types';
import { PROPER_LIST_URL, properAdapter } from './adapter';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

const LIST = JSON.stringify([
  { slug: 'santa-beatriz', distrito: 'cercado de lima', url_fachada: 'https://img/sb.jpg' },
  { slug: 'jazmines', distrito: 'lince', url_fachada: 'https://img/jaz.jpg' },
  { slug: 'broken', distrito: 'lince' },
  { slug: 'el-sol-1202', distrito: 'lince', tipo: 'departamento alquiler' },
]);

function profile(distrito: string): string {
  const json = JSON.parse(fixture('orue-profile.json'));
  json.proyecto.distrito = distrito;
  return JSON.stringify(json);
}

function unitInLince() {
  const json = JSON.parse(fixture('el-sol-1202.json'));
  json.pageProps.props.departamento.distrito = 'lince';
  return json;
}

const PROFILE_API = 'https://3nors0yi4b.execute-api.us-east-2.amazonaws.com/production/proyecto_profile/';
const GALLERY_API = 'https://inversiones.proper.com.pe/api/galeria-proyecto?slug=';

function adapter(failing: string[] = [], failingGallery: string[] = [], seen: string[] = []) {
  return properAdapter({
    wait: async () => {},
    retries: 0,
    log: () => {},
    fetchText: async (url) => {
      seen.push(url);
      if (url === PROPER_LIST_URL) return LIST;
      if (url.endsWith('/propiedades')) return fixture('propiedades.html');
      if (failing.some((slug) => url.includes(`/${slug}.json`) || url.includes(`/${slug}/`))) throw new Error('HTTP 500');
      if (url.includes('/entrega-inmediata/el-sol-1202.json')) return JSON.stringify(unitInLince());
      if (url.startsWith(GALLERY_API)) {
        if (failingGallery.some((slug) => url.endsWith(slug))) throw new Error('HTTP 500');
        return fixture('orue-gallery.json');
      }
      if (url.startsWith(PROFILE_API)) return profile(url.includes('/santa-beatriz/') ? 'cercado de lima' : 'lince');
      throw new Error(`unexpected url ${url}`);
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
    assert.equal(lince[0].cards.length, 1);
    assert.equal(lince[0].cards[0].imageUrl, 'https://proyects-image.s3.us-east-2.amazonaws.com/395/areas_comunes/FACHADA.jpg');
    assert.equal(lince[1].cards.length, 1);
    assert.equal(lince[1].cards[0].sourcePostingId, 'el-sol-1202');
    assert.equal(result.skippedOutsideLima, 1);
  });

  it('flags the crawl incomplete when a project detail fails', async () => {
    const { result } = await crawl(adapter(['broken']));
    assert.equal(result.incomplete, true);
    assert.match(result.districts.find((d) => d.districtSlug === 'lince')!.errors[0], /broken/);
  });

  it('keeps the project with the list facade when the gallery fails', async () => {
    const { batches, result } = await crawl(adapter([], ['jazmines']));
    const card = batches.flatMap((b) => b.cards).find((c) => c.sourcePostingId === 'jazmines')!;
    assert.equal(card.imageUrl, 'https://img/jaz.jpg');
    assert.deepEqual(card.imageUrls, ['https://img/jaz.jpg']);
    assert.equal(result.incomplete, false);
  });

  it('fetches the build id only when an immediate unit is listed', async () => {
    const withUnit: string[] = [];
    await crawl(adapter([], [], withUnit));
    assert.ok(withUnit.some((u) => u.endsWith('/propiedades')));
    const without: string[] = [];
    const a = properAdapter({
      wait: async () => {},
      retries: 0,
      log: () => {},
      fetchText: async (url) => {
        without.push(url);
        if (url === PROPER_LIST_URL) return JSON.stringify([{ slug: 'jazmines', distrito: 'lince' }]);
        if (url.startsWith(GALLERY_API)) return fixture('orue-gallery.json');
        return profile('lince');
      },
    });
    await a.crawl({ districts: ['lince'], operation: Operation.SALE, onBatch: async () => {} });
    assert.ok(!without.some((u) => u.includes('/propiedades') || u.includes('/_next/data/')));
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

describe('properAdapter maxPages', () => {
  it('fetches one project when capped at 1, without marking the crawl incomplete', async () => {
    const profiles: string[] = [];
    const a = properAdapter({
      wait: async () => {},
      retries: 0,
      log: () => {},
      fetchText: async (url) => {
        if (url.startsWith(PROFILE_API)) profiles.push(url);
        if (url === PROPER_LIST_URL) return LIST;
        if (url.endsWith('/propiedades')) return fixture('propiedades.html');
        if (url.startsWith(GALLERY_API)) return fixture('orue-gallery.json');
        return profile('lince');
      },
    });
    const result = await a.crawl({ districts: ['lince'], operation: Operation.SALE, maxPages: 1, onBatch: async () => {} });
    assert.equal(profiles.length, 1);
    assert.equal(result.incomplete, false);
  });
});
