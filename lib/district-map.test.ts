import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_METRICS, buildDistrictFeatures, formatMetricValue, metricScale, nseLima, roundCoordinates } from './district-map';
import type { LatestStat } from './stats/latest';
import type { PlaceDef } from './stats/files';

const ring: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 0]];
const stat = (value: number, period = '2024', source = 'Ipsos'): LatestStat => ({ value, period, source });

const places: PlaceDef[] = [
  { place: 'ipsos-lima-norte', kind: 'zone', label: 'Lima Norte (Ipsos)', districts: ['comas'] },
  { place: 'lima-metropolitana', kind: 'city', label: 'Lima Metropolitana', districts: [] },
];
const latest = new Map<string, Map<string, LatestStat>>([
  ['ipsos-lima-norte', new Map([['zone_household_income_pen', stat(4_000)]])],
  ['comas', new Map([['poverty_pct', stat(12.5, '2023', 'INEI')]])],
  ['miraflores', new Map([['poverty_pct', stat(0, '2023', 'INEI')]])],
]);
const boundaries = ['comas', 'miraflores', 'lince'].map((slug) => ({ slug, name: slug.toUpperCase(), rings: [ring] }));

test('MAP_METRICS keeps the agreed order and labels', () => {
  assert.deepEqual(MAP_METRICS.map((m) => m.key), ['zone_household_income_pen', 'high_income_pct', 'poverty_pct', 'complaints_per_10k']);
  assert.deepEqual(MAP_METRICS.map((m) => m.label), [
    'Ingreso del hogar (zona Ipsos)', 'Vecinos de ingreso alto', 'Pobreza', 'Denuncias por 10 mil habitantes',
  ]);
});

test('a district in an Ipsos zone gets the zone income and label; one outside gets null', () => {
  const fc = buildDistrictFeatures(boundaries, latest, places, ['comas']);
  const by = Object.fromEntries(fc.features.map((f) => [f.properties!.slug, f.properties!]));
  assert.equal(by.comas.zone_household_income_pen, 4_000);
  assert.equal(by.comas.zone, 'Lima Norte (Ipsos)');
  assert.equal(by.lince.zone_household_income_pen, null);
  assert.equal(by.lince.zone, null);
});

test('a missing statistic is null, a real zero stays 0', () => {
  const fc = buildDistrictFeatures(boundaries, latest, places, []);
  const by = Object.fromEntries(fc.features.map((f) => [f.properties!.slug, f.properties!]));
  assert.equal(by.lince.poverty_pct, null);
  assert.equal(by.comas.high_income_pct, null);
  assert.equal(by.miraflores.poverty_pct, 0);
  assert.equal(by.comas.poverty_pct, 12.5);
});

test('tracked is true only for the given slugs', () => {
  const fc = buildDistrictFeatures(boundaries, latest, places, ['miraflores']);
  assert.deepEqual(fc.features.map((f) => f.properties!.tracked), [false, true, false]);
  assert.equal(fc.features[0].geometry.type, 'MultiPolygon');
});

test('districts without a boundary are left out', () => {
  const fc = buildDistrictFeatures([{ slug: 'x', name: 'X', rings: [] }], latest, places, []);
  assert.equal(fc.features.length, 0);
});

test('metricScale ignores nulls and returns increasing breaks', () => {
  const b = metricScale([null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null], 5);
  assert.equal(b.length, 4);
  for (let i = 1; i < b.length; i++) assert.ok(b[i] > b[i - 1]);
  assert.deepEqual(metricScale([null, null], 5), []);
});

test('nseLima returns the five levels A to E from lima-metropolitana', () => {
  const l = new Map(latest);
  l.set('lima-metropolitana', new Map([
    ['nse_a_pct', stat(5)], ['nse_b_pct', stat(20)], ['nse_c_pct', stat(40)], ['nse_d_pct', stat(25)], ['nse_e_pct', stat(10)],
  ]));
  assert.deepEqual(nseLima(l), [
    { level: 'A', pct: 5 }, { level: 'B', pct: 20 }, { level: 'C', pct: 40 }, { level: 'D', pct: 25 }, { level: 'E', pct: 10 },
  ]);
  assert.deepEqual(nseLima(latest), []);
});

test('roundCoordinates rounds to 5 decimals, keeps properties, and does not change the input', () => {
  const fc = buildDistrictFeatures(
    [{ slug: 'comas', name: 'COMAS', rings: [[[-77.123456789, -12.987654321], [-77.1, -12.9], [-77.2, -12.8], [-77.123456789, -12.987654321]]] }],
    latest, places, [],
  );
  const out = roundCoordinates(fc);
  assert.deepEqual(out.features[0].geometry.coordinates[0][0][0], [-77.12346, -12.98765]);
  assert.equal(out.features[0].properties!.slug, 'comas');
  assert.equal(fc.features[0].geometry.coordinates[0][0][0][0], -77.123456789);
  assert.ok(JSON.stringify(out).length < JSON.stringify(fc).length);
});

test('formatMetricValue shows sin datos for null and never 0', () => {
  assert.equal(formatMetricValue(null, '%'), 'sin datos');
  assert.equal(formatMetricValue(0, '%'), '0 %');
  assert.match(formatMetricValue(12.5, '%'), /^12[.,]5 %$/);
  assert.match(formatMetricValue(4000, 'S/ al mes'), /^S\/ 4\D?000 al mes$/);
  assert.match(formatMetricValue(31.2, 'denuncias'), /^31[.,]2 denuncias$/);
  assert.match(formatMetricValue(3.4, null), /^3[.,]4$/);
});
