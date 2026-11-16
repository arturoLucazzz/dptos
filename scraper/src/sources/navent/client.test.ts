import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { Operation } from '@/lib/generated/prisma/enums';
import { naventSearchUrl, postingsRequestBody, zoneFromSearchPage } from './client';

function capturedBody(site: string): Record<string, unknown> {
  const file = path.join(__dirname, '__fixtures__', `${site}-lince-p1.request.json`);
  return JSON.parse(readFileSync(file, 'utf8')).body;
}

function searchPage(appliedFilters: unknown): string {
  const state = JSON.stringify({ listStore: { appliedFilters, listPostings: [] } });
  return `<html><body><script id="preloadedData">window.__PRELOADED_STATE__ = ${state};</script></body></html>`;
}

describe('postingsRequestBody', () => {
  // The one deliberate difference from the site's own call is the price sort,
  // which keeps the order stable while paging.
  it('sends what the urbania search page sends, sorted by price', () => {
    assert.deepEqual(postingsRequestBody('51119493', Operation.SALE, 1), {
      ...capturedBody('urbania'),
      sort: 'low_price',
    });
  });

  it('sends what the adondevivir search page sends, sorted by price', () => {
    assert.deepEqual(postingsRequestBody('119493', Operation.SALE, 1), {
      ...capturedBody('adondevivir'),
      sort: 'low_price',
    });
  });

  it('asks for rent and later pages', () => {
    const body = postingsRequestBody('119493', Operation.RENT, 4);
    assert.equal(body.tipoDeOperacion, '2');
    assert.equal(body.pagina, 4);
  });
});

describe('naventSearchUrl', () => {
  it('builds each site search page for a district', () => {
    assert.equal(
      naventSearchUrl('urbania', 'lince', Operation.SALE),
      'https://urbania.pe/buscar/venta-de-departamentos-en-lince--lima--lima'
    );
    assert.equal(
      naventSearchUrl('adondevivir', 'lince', Operation.RENT),
      'https://www.adondevivir.com/departamentos-en-alquiler-en-lince.html'
    );
  });
});

describe('zoneFromSearchPage', () => {
  it('reads the zone id the page applied', () => {
    const html = searchPage([{ type: 'location', options: [{ label: 'Lince', type: 'zone', min: '119493' }] }]);
    assert.equal(zoneFromSearchPage(html, 'lince'), '119493');
  });

  it('refuses a page that searched another district', () => {
    const html = searchPage([{ type: 'location', options: [{ label: 'San Isidro', type: 'zone', min: '1' }] }]);
    assert.equal(zoneFromSearchPage(html, 'lince'), null);
  });

  it('refuses a page with no district, as when the site widens an unknown slug', () => {
    assert.equal(zoneFromSearchPage(searchPage([]), 'lince'), null);
    assert.equal(zoneFromSearchPage('<html></html>', 'lince'), null);
  });
});
