import test from 'node:test';
import assert from 'node:assert/strict';
import type { DepartamentosRow } from './departamentos-query';
import { homeKpis, moneyLine, recommend } from './home';

function row(postingId: string, over: Partial<DepartamentosRow> = {}): DepartamentosRow {
  return {
    postingId,
    pricePen: 300000,
    grossRentPen: null,
    discountPct: null,
    locationScore: null,
    daysPublished: null,
    monthlyGainPen: null,
    ...over,
  } as unknown as DepartamentosRow;
}

const rows = [
  row('a', { monthlyGainPen: 200, locationScore: 7 }),
  row('b'),
  row('c', { monthlyGainPen: 50, locationScore: 9 }),
];

test('homeKpis takes medians and skips rows with no rent for the yield', () => {
  const k = homeKpis([{ pricePen: 300000, grossRentPen: 1500 }, { pricePen: 400000, grossRentPen: null }, { pricePen: 500000, grossRentPen: 2500 }], [2000, 2500, 3000]);
  assert.deepEqual(k, { typicalSalePen: 400000, typicalRentPen: 2500, grossYieldPct: 6, saleCount: 3 });
});

test('homeKpis with no data gives nulls and zero', () => {
  assert.deepEqual(homeKpis([], []), { typicalSalePen: null, typicalRentPen: null, grossYieldPct: null, saleCount: 0 });
});

test('recommend puts rows without the sort value last, in every mode', () => {
  assert.deepEqual(recommend(rows, 'gain', 3).rows.map((r) => r.postingId), ['a', 'c', 'b']);
  assert.deepEqual(recommend(rows, 'location', 3).rows.map((r) => r.postingId), ['c', 'a', 'b']);
});

test('recommend sorts yield, below and new, ties by postingId', () => {
  const rs = [
    row('z', { pricePen: 100000, grossRentPen: 1000, discountPct: 5, daysPublished: 3 }),
    row('y', { pricePen: 200000, grossRentPen: 1000, discountPct: 10, daysPublished: 1 }),
    row('x', { discountPct: 10, daysPublished: 1 }),
  ];
  assert.deepEqual(recommend(rs, 'yield', 3).rows.map((r) => r.postingId), ['z', 'y', 'x']);
  assert.deepEqual(recommend(rs, 'below', 3).rows.map((r) => r.postingId), ['x', 'y', 'z']);
  assert.deepEqual(recommend(rs, 'new', 3).rows.map((r) => r.postingId), ['x', 'y', 'z']);
});

test('recommend reports whether more rows exist', () => {
  assert.equal(recommend(rows, 'gain', 2).hasMore, true);
  assert.equal(recommend(rows, 'gain', 3).hasMore, false);
  assert.equal(recommend(rows, 'gain', 16).rows.length, 3);
});

test('moneyLine', () => {
  assert.deepEqual(moneyLine(1234), { text: 'Ganas S/ 1,234/mes', tone: 'gain' });
  assert.deepEqual(moneyLine(0), { text: 'Ganas S/ 0/mes', tone: 'gain' });
  assert.deepEqual(moneyLine(-80), { text: 'Pones S/ 80/mes', tone: 'loss' });
  assert.equal(moneyLine(null), null);
});

test('moneyLine rounds a tiny loss to zero without a minus sign', () => {
  assert.deepEqual(moneyLine(-0.4), { text: 'Ganas S/ 0/mes', tone: 'gain' });
});
