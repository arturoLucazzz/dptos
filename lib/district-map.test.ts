import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_METRICS, buildDistrictFeatures, formatMetricValue, metricScale, legendClasses, nseLima, nseSource, roundCoordinates, trackedBounds } from './district-map';
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

test('legendClasses: no values or all null gives no classes and no breaks', () => {
  assert.deepEqual(legendClasses([]), { breaks: [], classes: [] });
  assert.deepEqual(legendClasses([null, null]), { breaks: [], classes: [] });
});

test('legendClasses: one distinct value gives one class with its real value', () => {
  const l = legendClasses([5, 5, null, 5]);
  assert.deepEqual(l.breaks, []);
  assert.equal(l.classes.length, 1);
  assert.match(l.classes[0].label, /^5$/);
});

test('legendClasses: 5 or fewer distinct values get one class each, labeled with the real value', () => {
  const l = legendClasses([4307, 4307, 4309, 8258, null, 4069, 4309]);
  assert.deepEqual(l.breaks, [4307, 4309, 8258]);
  assert.equal(l.classes.length, l.breaks.length + 1);
  assert.deepEqual(l.classes.map((c) => c.label.replace(/\D/g, '')), ['4069', '4307', '4309', '8258']);
  assert.ok(l.classes.every((c) => !/ a |Menos|más/.test(c.label)));
});

test('legendClasses: many distinct values use rounded quantile bands, deduped, classes = breaks + 1', () => {
  const values = Array.from({ length: 40 }, (_, i) => i * 1.2345 + 0.0123);
  const l = legendClasses(values);
  assert.equal(l.classes.length, l.breaks.length + 1);
  assert.ok(l.breaks.length >= 1);
  for (let i = 1; i < l.breaks.length; i++) assert.ok(l.breaks[i] > l.breaks[i - 1]);
  assert.ok(l.breaks.every((b) => Math.abs(b * 10 - Math.round(b * 10)) < 1e-9));
  assert.match(l.classes[0].label, /^Menos de /);
  assert.match(l.classes[l.classes.length - 1].label, / o más$/);
  assert.ok(l.classes.slice(1, -1).every((c) => / a /.test(c.label)));
});

test('legendClasses: large values round to whole numbers', () => {
  const values = Array.from({ length: 30 }, (_, i) => 1000 + i * 137.77);
  assert.ok(legendClasses(values).breaks.every((b) => Number.isInteger(b)));
});

test('trackedBounds covers only tracked districts, and is null when none are tracked', () => {
  const r1: [number, number][] = [[-77.1, -12.1], [-77.0, -12.1], [-77.0, -12.0], [-77.1, -12.1]];
  const r2: [number, number][] = [[-76.5, -11.5], [-76.4, -11.5], [-76.4, -11.4], [-76.5, -11.5]];
  const fc = buildDistrictFeatures(
    [{ slug: 'comas', name: 'COMAS', rings: [r1] }, { slug: 'lince', name: 'LINCE', rings: [r2] }],
    latest, places, ['comas'],
  );
  assert.deepEqual(trackedBounds(fc), [[-77.1, -12.1], [-77.0, -12.0]]);
  assert.equal(trackedBounds(buildDistrictFeatures([{ slug: 'comas', name: 'COMAS', rings: [r1] }], latest, places, [])), null);
});

test('nseSource names the source and period of the NSE rows, null when not loaded', () => {
  const l = new Map([['lima-metropolitana', new Map([['nse_a_pct', stat(2.6, '2025', 'APEIM, NSE 2025')], ['nse_b_pct', stat(18, '2025', 'APEIM, NSE 2025')]])]]);
  assert.deepEqual(nseSource(l), { source: 'APEIM, NSE 2025', period: '2025' });
  assert.equal(nseSource(latest), null);
});

test('legendClasses: a cut at the smallest value (many zeros) does not make an empty first class', () => {
  const values = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 40, 50, 60, 70];
  const l = legendClasses(values);
  assert.ok(l.breaks.every((b) => b > 0));
  assert.ok(!l.classes.some((c) => c.label === 'Menos de 0'));
  assert.equal(l.classes.length, l.breaks.length + 1);
});

test('legendClasses: many zeros and six other values (every cut at or below the minimum) does not throw', () => {
  const values = [...Array(30).fill(0), 1, 2, 3, 4, 5, 6];
  const l = legendClasses(values);
  assert.deepEqual(l.breaks, [1]);
  assert.equal(l.classes.length, 2);
  assert.equal(l.classes[0].label, '0');
  assert.match(l.classes[1].label, /^1 o más$/);
});

test('legendClasses: a rounded cut never goes above the maximum value', () => {
  const values = [...Array(30).fill(100.2), 100.3, 100.4, 100.45, 100.46, 100.47, 100.48];
  const l = legendClasses(values);
  assert.ok(l.breaks.every((b) => b <= 100.48));
  assert.equal(l.classes.length, l.breaks.length + 1);
});
