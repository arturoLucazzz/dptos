import test from 'node:test';
import assert from 'node:assert/strict';
import type { HomeRow } from '../home-rows';
import { EXCLUDED_TITLE, GONE_TITLE, type PickView } from './pick-view';
import { EXCEL_NUM_FMT, buildCompareTable, buildExcelRows, excelFileName } from './compare';

function unit(id: string, price: number, gain: number | null, over: Partial<HomeRow> = {}, note: string | null = null): PickView {
  const row = {
    postingId: id, propertyId: id, url: `https://x/${id}`, imageUrl: null, districtName: 'Lince',
    bedrooms: 2, areaM2: 50, pricePen: price, grossRentPen: 2000, paymentPen: 1500, monthlyGainPen: gain,
    entryCostPen: 60000, discountPct: null, daysPublished: 3, locationScore: 7, locationReasons: [], ...over,
  } as HomeRow;
  return { itemId: id, type: 'unit', title: '2 dorm', pricePen: price, areaM2: row.areaM2, districtName: 'Lince', imageUrl: null, money: null, note, gone: false, statusLabel: null, url: row.url, row };
}
const gone = (): PickView => ({ itemId: 'g', type: 'unit', title: GONE_TITLE, pricePen: null, areaM2: null, districtName: '', imageUrl: null, money: null, note: 'ojo', gone: true, statusLabel: GONE_TITLE, url: null, row: null });
const rowOf = (t: ReturnType<typeof buildCompareTable>, label: string) => t.find((r) => r.label === label)!;

test('rows come in the agreed order', () => {
  assert.deepEqual(buildCompareTable([unit('a', 1, 1)]).map((r) => r.label), [
    'Precio', 'Precio por m²', 'Área', 'Alquiler estimado', 'Cuota del banco', 'Ganancia mensual', 'Rentabilidad bruta', 'Efectivo día 1', 'Ubicación',
  ]);
});

test('lowest price and highest gain win among three picks', () => {
  const t = buildCompareTable([unit('a', 300000, 100), unit('b', 250000, 300), unit('c', 400000, -50)]);
  assert.deepEqual(rowOf(t, 'Precio').cells.map((c) => c.best), [false, true, false]);
  assert.deepEqual(rowOf(t, 'Ganancia mensual').cells.map((c) => c.best), [false, true, false]);
});

test('a gone pick shows "-" everywhere and never wins', () => {
  const t = buildCompareTable([gone(), unit('a', 300000, 100), unit('b', 350000, 50)]);
  for (const r of t) {
    assert.equal(r.cells[0].text, '-');
    assert.equal(r.cells[0].best, false);
  }
  assert.equal(rowOf(t, 'Precio').cells[1].best, true);
});

test('a pick outside the analysis shows its last price and area, never wins, and "-" for money', () => {
  const last: PickView = { ...gone(), title: '3 dorm · 70 m²', pricePen: 100000, areaM2: 200, statusLabel: EXCLUDED_TITLE, url: 'https://x/g' };
  const t = buildCompareTable([last, unit('a', 300000, 100), unit('b', 350000, 50)]);
  assert.equal(rowOf(t, 'Precio').cells[0].text, `S/ ${(100000).toLocaleString('es-PE')}`);
  assert.equal(rowOf(t, 'Precio').cells[0].best, false);
  assert.equal(rowOf(t, 'Precio').cells[1].best, true);
  assert.equal(rowOf(t, 'Área').cells[0].text, '200 m²');
  assert.equal(rowOf(t, 'Área').cells[0].best, false);
  for (const label of ['Precio por m²', 'Alquiler estimado', 'Cuota del banco', 'Ganancia mensual', 'Rentabilidad bruta', 'Efectivo día 1', 'Ubicación']) {
    assert.equal(rowOf(t, label).cells[0].text, '-', label);
  }
});

test('Excel keeps the last price, area, link and the label of a pick outside the analysis', () => {
  const last: PickView = { ...gone(), title: '3 dorm · 70 m²', pricePen: 100000, areaM2: 70, statusLabel: EXCLUDED_TITLE, url: 'https://x/g' };
  const [header, row] = buildExcelRows([last]);
  const col = (h: string) => row[header.indexOf(h)];
  assert.equal(col('Propiedad'), '3 dorm · 70 m²');
  assert.equal(col('Estado'), 'Fuera del análisis');
  assert.equal(col('Precio'), 100000);
  assert.equal(col('Área'), 70);
  assert.equal(col('Ganancia mensual'), null);
  assert.equal(col('Enlace'), 'https://x/g');
  assert.equal(buildExcelRows([unit('a', 1, 1)])[1][header.indexOf('Estado')], null);
});

test('a tie marks every tied cell', () => {
  const t = buildCompareTable([unit('a', 300000, 100), unit('b', 300000, 100), unit('c', 400000, 100)]);
  assert.deepEqual(rowOf(t, 'Precio').cells.map((c) => c.best), [true, true, false]);
});

test('a project shows its price and "-" elsewhere', () => {
  const project: PickView = { ...gone(), type: 'project', title: 'Torre', pricePen: 200000, gone: false, url: 'https://p' };
  const t = buildCompareTable([project, unit('a', 300000, 100)]);
  assert.equal(rowOf(t, 'Precio').cells[0].best, true);
  assert.equal(rowOf(t, 'Área').cells[0].text, '-');
  assert.equal(rowOf(t, 'Ganancia mensual').cells[0].best, false);
});

test('excelFileName cleans the name', () => {
  assert.equal(excelFileName('Lince / 2 dorm "final"'), 'Lince - 2 dorm final.xlsx');
  assert.equal(excelFileName('Jesús María'), 'Jesús María.xlsx');
  assert.equal(excelFileName('  '), 'inversion.xlsx');
});

test('buildExcelRows has a header, the link last, and the gone title', () => {
  const rows = buildExcelRows([unit('a', 300000, 100, {}, 'bonito'), gone()]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0][rows[0].length - 1], 'Enlace');
  assert.equal(rows[1][rows[1].length - 1], 'https://x/a');
  assert.equal(rows[1][rows[1].length - 2], 'bonito');
  assert.equal(rows[2][0], 'Ya no está publicado');
  assert.equal(rows[2][rows[2].length - 1], null);
});

test('a row with a single value marks nothing', () => {
  const t = buildCompareTable([unit('a', 300000, 100)]);
  assert.ok(t.every((r) => r.cells.every((c) => !c.best)));
});

test('every compare column has a number format', () => {
  const header = buildExcelRows([unit('a', 1, 1)])[0] as string[];
  for (const h of ['Precio', 'Precio por m²', 'Área', 'Alquiler estimado', 'Cuota del banco', 'Ganancia mensual', 'Rentabilidad bruta', 'Efectivo día 1', 'Ubicación']) {
    assert.ok(header.includes(h) && EXCEL_NUM_FMT[h], h);
  }
});
