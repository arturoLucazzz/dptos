import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseFeed, matchesKeywords, fetchNews, type NewsDb } from './parse';

const fx = (f: string) => readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
const NOW = new Date('2026-11-20T12:00:00Z');

test('parseFeed reads RSS 2.0, strips HTML, decodes entities, drops items without link or title', () => {
  const items = parseFeed(fx('gestion.xml'), 'Gestión');
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], {
    url: 'https://gestion.pe/economia/tasa-hipotecaria-baja-noticia/',
    title: 'Tasa hipotecaria baja en octubre',
    publishedAt: new Date('2026-11-20T14:00:00Z'),
  });
  assert.equal(items[1].title, 'Alquiler sube & la construcción crece');
});

test('parseFeed reads Atom', () => {
  const items = parseFeed(fx('andina-atom.xml'), 'Andina');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Vivienda: Mivivienda & Techo Propio');
  assert.equal(items[0].url, 'https://andina.pe/agencia/noticia-mivivienda-1.aspx');
  assert.equal(items[0].publishedAt?.toISOString(), '2026-11-21T02:00:00.000Z');
  assert.equal(items[1].publishedAt?.toISOString(), '2026-11-18T08:00:00.000Z');
});

test('parseFeed throws on bad XML and on non-feeds', () => {
  assert.throws(() => parseFeed(fx('bad.xml'), 'X'));
  assert.throws(() => parseFeed(fx('notxml.txt'), 'X'));
});

test('parseFeed gives a null date when it is missing or invalid', () => {
  const xml = '<rss><channel><item><title>A</title><link>https://a.pe/1</link><pubDate>mañana</pubDate></item></channel></rss>';
  assert.equal(parseFeed(xml, 'X')[0].publishedAt, null);
});

test('matchesKeywords ignores case and accents', () => {
  assert.equal(matchesKeywords('Crédito HIPOTECARIO sube', ['hipotecari']), true);
  assert.equal(matchesKeywords('La Construccion crece', ['construcción']), true);
  assert.equal(matchesKeywords('Sector construcción', ['construccion']), true);
  assert.equal(matchesKeywords('Fútbol', ['hipotecari', 'bcrp']), false);
  assert.equal(matchesKeywords('Fútbol', []), false);
});

function fakeDb() {
  const rows = new Map<string, { url: string; title: string; source: string; publishedAt: Date | null; fetchedAt: Date }>();
  const db: NewsDb = {
    async insertMany(data) {
      let n = 0;
      for (const r of data) if (!rows.has(r.url)) { rows.set(r.url, r); n++; }
      return n;
    },
  };
  return { db, rows };
}

const feeds = [
  { nombre: 'Gestión', url: 'https://g/rss', prioridad: 1 },
  { nombre: 'Andina', url: 'https://a/rss', prioridad: 2 },
];

test('fetchNews keeps matching items, stores a URL once across feeds and runs, and reports a bad feed', async () => {
  const { db, rows } = fakeDb();
  const xmls: Record<string, string> = {
    'https://g/rss': fx('gestion.xml'),
    'https://a/rss': fx('bad.xml'),
  };
  const fetch = async (url: string) => xmls[url];
  const keywords = ['hipotecari', 'alquiler', 'construcción'];
  const r1 = await fetchNews({ feeds, keywords, fetch, db, now: () => NOW });
  assert.deepEqual(r1[0], { source: 'Gestión', ok: true, found: 3, kept: 2, inserted: 2 });
  assert.equal(r1[1].ok, false);
  assert.ok(r1[1].error);
  assert.equal(rows.size, 2);
  assert.equal(rows.get('https://gestion.pe/economia/alquiler-sube-noticia/')?.source, 'Gestión');

  const r2 = await fetchNews({ feeds, keywords, fetch, db, now: () => NOW });
  assert.equal(r2[0].inserted, 0);
  assert.equal(rows.size, 2);
});

test('fetchNews stores the same URL from two feeds once, and survives a failing fetch', async () => {
  const { db, rows } = fakeDb();
  const one = (u: string) => `<rss><channel><item><title>Vivienda nueva</title><link>${u}</link></item></channel></rss>`;
  const three = [...feeds, { nombre: 'El Comercio', url: 'https://c/rss', prioridad: 3 }];
  const fetch = async (url: string) => {
    if (url === 'https://c/rss') throw new Error('timeout');
    return one('https://same.pe/1');
  };
  const r = await fetchNews({ feeds: three, keywords: ['vivienda'], fetch, db, now: () => NOW });
  assert.equal(rows.size, 1);
  assert.deepEqual(r.map((x) => [x.ok, x.inserted]), [[true, 1], [true, 0], [false, 0]]);
  assert.equal(r[2].error, 'timeout');
});

test('parseFeed reads the real Andina RSS shape (media namespace, -0500 dates)', () => {
  const items = parseFeed(fx('andina-rss.xml'), 'Andina');
  assert.equal(items.length, 2);
  assert.equal(items[0].publishedAt?.toISOString(), '2026-11-21T02:00:00.000Z');
  assert.equal(items[0].title, 'Ministerio de Vivienda culmina construcción de cámaras de bombeo');
});
