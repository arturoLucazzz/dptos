import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_FILTERS, normalizeName, normalizeNote, parseInvestmentFilters, parsePickTarget, picksLabel } from './filters';

test('missing or broken input gives the defaults', () => {
  assert.deepEqual(parseInvestmentFilters(undefined), DEFAULT_FILTERS);
  assert.deepEqual(parseInvestmentFilters('{bad'), DEFAULT_FILTERS);
  assert.deepEqual(parseInvestmentFilters(null), DEFAULT_FILTERS);
});

test('each field falls back on its own', () => {
  const got = parseInvestmentFilters({ priceMin: -5, bedroomsMin: 2.7, sort: 'nope', kind: 'x', districts: ['lince', 3] });
  assert.equal(got.priceMin, null);
  assert.equal(got.bedroomsMin, 3);
  assert.equal(got.sort, 'monthlyGain');
  assert.equal(got.kind, 'units');
  assert.deepEqual(got.districts, ['lince']);
});

test('valid values are kept, and a JSON string is parsed', () => {
  const got = parseInvestmentFilters(JSON.stringify({ priceMax: 500000, kind: 'projects', order: 'asc', sort: 'pricePen', sources: ['nope'] }));
  assert.equal(got.priceMax, 500000);
  assert.equal(got.kind, 'projects');
  assert.equal(got.order, 'asc');
  assert.equal(got.sort, 'pricePen');
  assert.deepEqual(got.sources, []);
});

test('area needs a ring of 4 or more number pairs', () => {
  assert.equal(parseInvestmentFilters({ area: [[-77, -12], [-77.1, -12]] }).area, null);
  assert.equal(parseInvestmentFilters({ area: [[-77, -12], ['a', 1], [1, 2], [3, 4]] }).area, null);
  const ring = [[-77, -12], [-77.1, -12], [-77.1, -12.1], [-77, -12]];
  assert.deepEqual(parseInvestmentFilters({ area: ring }).area, ring);
});

test('area must be a closed, valid polygon', () => {
  // Open: the last pair is not the first.
  assert.equal(parseInvestmentFilters({ area: [[-77, -12], [-77.1, -12], [-77.1, -12.1], [-77, -12.1]] }).area, null);
  // A bow tie, closed.
  assert.equal(parseInvestmentFilters({ area: [[-77, -12], [-77.1, -12.1], [-77.1, -12], [-77, -12.1], [-77, -12]] }).area, null);
});

test('normalizeNote keeps one line of at most 280 characters', () => {
  assert.equal(normalizeNote('  a\nb\r\nc  '), 'a b c');
  assert.equal(normalizeNote('   '), null);
  assert.equal(normalizeNote(''), null);
  assert.equal(normalizeNote('x'.repeat(300))?.length, 280);
});

test('normalizeName trims, cuts at 80, and keeps the old name when empty', () => {
  assert.equal(normalizeName('  Mi plan ', 'Old'), 'Mi plan');
  assert.equal(normalizeName('   ', 'Old'), 'Old');
  assert.equal(normalizeName('y'.repeat(100), 'Old').length, 80);
});

test('picksLabel is singular for one pick', () => {
  assert.equal(picksLabel(0), '0 elegidos');
  assert.equal(picksLabel(1), '1 elegido');
  assert.equal(picksLabel(2), '2 elegidos');
});

test('parsePickTarget keeps one non-empty string id and rejects the rest', () => {
  assert.deepEqual(parsePickTarget({ propertyId: 'pr1' }), { propertyId: 'pr1' });
  assert.deepEqual(parsePickTarget({ projectId: 'pj1' }), { projectId: 'pj1' });
  assert.equal(parsePickTarget({ propertyId: '' }), null);
  assert.equal(parsePickTarget({ propertyId: '   ' }), null);
  assert.equal(parsePickTarget({ propertyId: 5 }), null);
  assert.equal(parsePickTarget({ projectId: null }), null);
  assert.equal(parsePickTarget({ propertyId: 'a', projectId: 'b' }), null);
  assert.equal(parsePickTarget(null), null);
  assert.equal(parsePickTarget('pr1'), null);
  assert.equal(parsePickTarget({}), null);
});
