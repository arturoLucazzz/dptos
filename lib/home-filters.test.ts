import assert from 'node:assert/strict';
import test from 'node:test';
import { hasActiveFilters, loadHomeFilters, serializeHomeFilters, toListingFilter } from './home-filters';

test('reads filters from the URL', () => {
  const f = loadHomeFilters('?precio_min=200000&precio_max=400000&dorm_min=2&distrito=lince,miraflores&fuente=urbania&orden=yield');
  assert.equal(f.precio_min, 200000);
  assert.equal(f.precio_max, 400000);
  assert.equal(f.dorm_min, 2);
  assert.deepEqual(f.distrito, ['lince', 'miraflores']);
  assert.deepEqual(f.fuente, ['urbania']);
  assert.equal(f.orden, 'yield');
});

test('maps the URL names to the query names', () => {
  const q = toListingFilter(
    loadHomeFilters('?precio_min=1&precio_max=2&dorm_min=1&dorm_max=3&distrito=lince&area_min=40&area_max=90&fuente=nexo&ubicacion_min=6'),
    new Set(['lince']),
  );
  assert.deepEqual(q, {
    districts: ['lince'],
    sources: ['nexo'],
    priceMin: 1,
    priceMax: 2,
    bedroomsMin: 1,
    bedroomsMax: 3,
    areaM2Min: 40,
    areaM2Max: 90,
    locationMin: 6,
  });
});

test('ignores junk values', () => {
  const f = loadHomeFilters('?precio_min=abc&fuente=ebay&orden=nope');
  const q = toListingFilter(f, new Set(['lince']));
  assert.equal(q.priceMin, null);
  assert.deepEqual(q.sources, []);
  assert.equal(f.orden, 'gain');
});

test('drops unknown districts and negative numbers', () => {
  const q = toListingFilter(loadHomeFilters('?distrito=lince,nowhere&dorm_min=-3'), new Set(['lince']));
  assert.deepEqual(q.districts, ['lince']);
  assert.equal(q.bedroomsMin, null);
});

test('swaps a min above the max', () => {
  const q = toListingFilter(loadHomeFilters('?area_min=90&area_max=50&precio_min=500&precio_max=100'), new Set());
  assert.equal(q.areaM2Min, 50);
  assert.equal(q.areaM2Max, 90);
  assert.equal(q.priceMin, 100);
  assert.equal(q.priceMax, 500);
});

test('serializes filters with n', () => {
  const s = serializeHomeFilters('/api/inicio/recomendados?n=24', { dorm_min: 2, distrito: ['lince'] });
  assert.match(s, /n=24/);
  assert.match(s, /dorm_min=2/);
  assert.match(s, /distrito=lince/);
});

test('hasActiveFilters ignores the tab', () => {
  assert.equal(hasActiveFilters(loadHomeFilters('?orden=yield')), false);
  assert.equal(hasActiveFilters(loadHomeFilters('?dorm_min=1')), true);
  assert.equal(hasActiveFilters(loadHomeFilters('')), false);
});
