import test from 'node:test';
import assert from 'node:assert/strict';
import type { HomeRow } from '../home-rows';
import { GONE_TITLE, type PickView } from './pick-view';
import { buildCompareTable, buildExcelRows, excelFileName } from './compare';

function unit(id: string, price: number, gain: number | null, over: Partial<HomeRow> = {}, note: string | null = null): PickView {
  const row = {
    postingId: id, propertyId: id, url: `https://x/${id}`, imageUrl: null, districtName: 'Lince',
    bedrooms: 2, areaM2: 50, pricePen: price, grossRentPen: 2000, paymentPen: 1500, monthlyGainPen: gain,
    entryCostPen: 60000, discountPct: null, daysPublished: 3, locationScore: 7, locationReasons: [], ...over,
  } as HomeRow;
  return { itemId: id, type: 'unit', title: '2 dorm', pricePen: price, districtName: 'Lince', imageUrl: null, money: null, note, gone: false, url: row.url, row };
}
const gone = (): PickView => ({ itemId: 'g', type: 'unit', title: GONE_TITLE, pricePen: null, districtName: '', imageUrl: null, money: null, note: 'ojo', gone: true, url: null, row: null });
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
  const t = buildCompareTable([gone(), unit('a', 300000, 100)]);
  for (const r of t) {
    assert.equal(r.cells[0].text, '-');
    assert.equal(r.cells[0].best, false);
  }
  assert.equal(rowOf(t, 'Precio').cells[1].best, true);
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
