import test from 'node:test';
import assert from 'node:assert/strict';
import type { DepartamentosRow } from '../departamentos-query';
import type { ProjectRow } from '../project-rows';
import { toPickView, GONE_TITLE, EXCLUDED_TITLE } from './pick-view';

const unit = {
  postingId: 'po1',
  propertyId: 'pr1',
  url: 'https://x/1',
  imageUrl: 'https://img/1.jpg',
  districtName: 'Miraflores',
  bedrooms: 2,
  areaM2: 60,
  pricePen: 300000,
  grossRentPen: 1800,
  monthlyGainPen: -250.4,
  entryCostPen: 70000,
  discountPct: 5,
  daysPublished: 3,
  locationScore: 7.25,
  locationReasons: [],
  copies: [{ big: 'x' }],
} as unknown as DepartamentosRow;

const project: ProjectRow = {
  projectId: 'pj1',
  name: 'Torre Sol',
  districtSlug: 'surco',
  districtName: 'Surco',
  priceFromPen: 410000,
  deliveryDate: '2027-06',
  stage: null,
  imageUrl: null,
  url: 'https://x/p',
  lat: null,
  lon: null,
  postingIds: ['a'],
  newestAt: null,
  sources: [],
};

test('a unit pick maps the price, the district, and the money line', () => {
  const v = toPickView({ id: 'i1', propertyId: 'pr1', projectId: null, note: 'Ver el lunes' }, unit, null, { districtName: 'X' });
  assert.equal(v.itemId, 'i1');
  assert.equal(v.type, 'unit');
  assert.equal(v.pricePen, 300000);
  assert.equal(v.districtName, 'Miraflores');
  assert.deepEqual(v.money, { text: 'Pones S/ 250/mes', tone: 'loss' });
  assert.equal(v.gone, false);
  assert.equal(v.note, 'Ver el lunes');
  assert.equal(v.url, 'https://x/1');
  assert.equal(v.imageUrl, 'https://img/1.jpg');
  assert.equal(v.title, '2 dorm · 60 m²');
  assert.ok(v.row);
  assert.equal(v.row.postingId, 'po1');
  assert.equal('copies' in v.row, false);
});

test('a project pick uses the from price and has no money line', () => {
  const v = toPickView({ id: 'i2', propertyId: null, projectId: 'pj1', note: null }, null, project, { districtName: 'X' });
  assert.equal(v.type, 'project');
  assert.equal(v.pricePen, 410000);
  assert.equal(v.money, null);
  assert.equal(v.title, 'Torre Sol');
  assert.equal(v.districtName, 'Surco');
  assert.equal(v.row, null);
  assert.equal(v.gone, false);
});

test('a missing row is gone and keeps the note', () => {
  const v = toPickView({ id: 'i3', propertyId: 'pr9', projectId: null, note: 'Buen precio' }, null, null, { districtName: 'Barranco' });
  assert.equal(v.gone, true);
  assert.equal(v.title, GONE_TITLE);
  assert.equal(v.title, 'Ya no está publicado');
  assert.equal(v.note, 'Buen precio');
  assert.equal(v.districtName, 'Barranco');
  assert.equal(v.pricePen, null);
  assert.equal(v.money, null);
  assert.equal(v.url, null);
  assert.equal(v.row, null);
  assert.equal(v.type, 'unit');
  assert.equal(v.statusLabel, GONE_TITLE);
});

test('a missing project is gone too', () => {
  const v = toPickView({ id: 'i4', propertyId: null, projectId: 'pj9', note: null }, null, null, { districtName: 'Surco' });
  assert.equal(v.type, 'project');
  assert.equal(v.gone, true);
});

test('a unit pick outside the analysis with no live posting keeps its last known data, marked gone', () => {
  const v = toPickView({ id: 'i5', propertyId: 'pr5', projectId: null, note: 'Vi fotos' }, null, null, {
    districtName: 'Lince',
    lastKnown: { name: null, pricePen: 280000, bedrooms: 3, areaM2: 72, imageUrl: 'https://img/5.jpg', url: 'https://x/5', live: false },
  });
  assert.equal(v.gone, true);
  assert.equal(v.statusLabel, GONE_TITLE);
  assert.equal(v.title, '3 dorm · 72 m²');
  assert.equal(v.pricePen, 280000);
  assert.equal(v.areaM2, 72);
  assert.equal(v.imageUrl, 'https://img/5.jpg');
  assert.equal(v.url, 'https://x/5');
  assert.equal(v.districtName, 'Lince');
  assert.equal(v.money, null);
  assert.equal(v.row, null);
  assert.equal(v.note, 'Vi fotos');
});

test('a unit pick with a live posting but outside the analysis is "Fuera del análisis"', () => {
  const v = toPickView({ id: 'i6', propertyId: 'pr6', projectId: null, note: null }, null, null, {
    districtName: 'Lince',
    lastKnown: { name: null, pricePen: 90000, bedrooms: null, areaM2: null, imageUrl: null, url: null, live: true },
  });
  assert.equal(v.gone, true);
  assert.equal(v.statusLabel, EXCLUDED_TITLE);
  assert.equal(v.statusLabel, 'Fuera del análisis');
  assert.equal(v.title, '- dorm · - m²');
  assert.equal(v.pricePen, 90000);
  assert.equal(v.money, null);
});

test('a project pick outside the analysis keeps its name and last price', () => {
  const v = toPickView({ id: 'i7', propertyId: null, projectId: 'pj7', note: null }, null, null, {
    districtName: 'Surco',
    lastKnown: { name: 'Torre Luna', pricePen: 500000, bedrooms: null, areaM2: null, imageUrl: null, url: 'https://x/p7', live: false },
  });
  assert.equal(v.type, 'project');
  assert.equal(v.gone, true);
  assert.equal(v.title, 'Torre Luna');
  assert.equal(v.statusLabel, GONE_TITLE);
  assert.equal(v.pricePen, 500000);
  assert.equal(v.url, 'https://x/p7');
});

test('a live pick has no status label', () => {
  const v = toPickView({ id: 'i1', propertyId: 'pr1', projectId: null, note: null }, unit, null, { districtName: 'X' });
  assert.equal(v.statusLabel, null);
  assert.equal(v.areaM2, 60);
});
