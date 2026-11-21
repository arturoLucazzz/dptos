import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DistrictMarket, SourceStats } from './market-dashboard';
import { constructionRows, formatPenOrNoData, portalRows, rentVsSaleRows, yieldRows } from './market-chart-rows';

const d = (slug: string, over: Partial<DistrictMarket> = {}): DistrictMarket => ({
  slug,
  name: slug.toUpperCase(),
  typicalSalePen: 500_000,
  typicalRentPen: 2_500,
  grossYieldPct: 6,
  saleCount: 50,
  rentCount: 10,
  ...over,
});

describe('rentVsSaleRows', () => {
  it('keeps only districts with 20 or more sales', () => {
    const rows = rentVsSaleRows([d('a'), d('b', { saleCount: 19 }), d('c', { saleCount: 20 })]);
    assert.deepEqual(rows.map((r) => r.slug), ['a', 'c']);
  });
  it('keeps a missing rent as null, never 0', () => {
    const [row] = rentVsSaleRows([d('a', { typicalRentPen: null, rentCount: 0 })]);
    assert.equal(row.rent, null);
    assert.equal(row.rentCount, 0);
  });
});

describe('yieldRows', () => {
  it('sorts by yield, marks the top slugs, and puts districts without yield last as null', () => {
    const rows = yieldRows([d('a', { grossYieldPct: 5 }), d('b', { grossYieldPct: null }), d('c', { grossYieldPct: 7 })], ['c']);
    assert.deepEqual(rows.map((r) => [r.slug, r.yieldPct, r.top]), [
      ['c', 7, true],
      ['a', 5, false],
      ['b', null, false],
    ]);
  });
});

describe('constructionRows', () => {
  it('maps the three stages and drops districts with none', () => {
    const rows = constructionRows([
      { districtSlug: 'a', districtName: 'A', enPlanos: 1, enConstruccion: 2, entregaInmediata: 3, other: 4, total: 10, unitsApprox: 0 },
      { districtSlug: 'b', districtName: 'B', enPlanos: 0, enConstruccion: 0, entregaInmediata: 0, other: 2, total: 2, unitsApprox: 0 },
    ]);
    assert.deepEqual(rows, [{ slug: 'a', name: 'A', enPlanos: 1, enConstruccion: 2, entregaInmediata: 3 }]);
  });
});

describe('formatPenOrNoData', () => {
  it('says sin datos for null', () => {
    assert.equal(formatPenOrNoData(null), 'sin datos');
    assert.match(formatPenOrNoData(2500), /^S\/ 2.?500$/);
  });
});

describe('portalRows', () => {
  const stat = (source: SourceStats['source'], liveCount = 5): SourceStats => ({
    source,
    label: source,
    liveCount,
    typicalSalePen: 100,
    newLast7: 1,
    goneLast7: 2,
  });
  it('returns the four portals in order, dropping manual', () => {
    const rows = portalRows([stat('manual'), stat('nexo'), stat('urbania'), stat('proper')]);
    assert.deepEqual(rows.map((r) => r.source), ['urbania', 'adondevivir', 'proper', 'nexo']);
  });
  it('fills a missing portal with zeros, a null price, and its label', () => {
    const rows = portalRows([stat('urbania')]);
    const nexo = rows[3];
    assert.deepEqual(nexo, { source: 'nexo', label: 'Nexo', liveCount: 0, typicalSalePen: null, newLast7: 0, goneLast7: 0 });
    assert.equal(rows[0].liveCount, 5);
  });
});
