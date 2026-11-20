import { test } from 'node:test';
import assert from 'node:assert/strict';
import { departamentosApiQuery, urlOverrideNote } from './departamentos-search-params';

const base = {
  districts: [],
  fuentes: [],
  priceMin: null,
  priceMax: null,
  bedroomsMin: null,
  bedroomsMax: null,
  coverageMin: null,
  ubicacion: null,
  sort: 'monthlyGain',
  order: 'desc',
  page: 1,
};

test('assumption params present in the URL are forwarded to the API', () => {
  const q = new URLSearchParams(departamentosApiQuery({ ...base, tea: 7, inicial: 20, extra: 0 }));
  assert.equal(q.get('tea'), '7');
  assert.equal(q.get('inicial'), '20');
  assert.equal(q.get('extra'), '0');
});

test('absent assumption params are omitted so the cookie decides', () => {
  const q = new URLSearchParams(departamentosApiQuery({ ...base }));
  for (const k of ['tea', 'tcea', 'inicial', 'plazo', 'efectivo', 'extra']) assert.equal(q.has(k), false);
});

test('the override note names the overrides, and is null without any', () => {
  assert.equal(urlOverrideNote({}), null);
  assert.equal(
    urlOverrideNote({ tea: 7, inicial: 20 }),
    'Esta página usa supuestos del enlace (TEA 7%, inicial 20%).'
  );
});
