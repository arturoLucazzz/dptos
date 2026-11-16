import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseProjects,
  countGoneProperties,
  countProperties,
  perPropertyPerM2,
  priceIndexSamples,
  type PriceIndexRow,
} from './property-stats';

const post = (postingId: string, propertyId: string | null, districtSlug = 'miraflores') => ({
  postingId,
  propertyId,
  districtSlug,
});

describe('countProperties', () => {
  it('counts one property once across sources and a null property as its own', () => {
    const counts = countProperties([post('a', 'P'), post('b', 'P'), post('c', null), post('d', null)]);
    assert.equal(counts.get('miraflores'), 3);
  });
});

describe('countGoneProperties', () => {
  it('a property is gone only when every copy is gone', () => {
    const gone = [post('a', 'P'), post('b', 'Q'), post('c', 'Q'), post('d', null)];
    const counts = countGoneProperties(gone, new Set(['P']));
    // P still live elsewhere; Q (two dead copies) and the unit without property count.
    assert.equal(counts.get('miraflores'), 2);
  });
});

function row(over: Partial<PriceIndexRow> & Pick<PriceIndexRow, 'postingId'>): PriceIndexRow {
  return {
    propertyId: 'P',
    live: true,
    lastSeenAt: new Date('2026-11-10T00:00:00Z'),
    liveWeeks: ['2026-11-09'],
    pricePen: 400_000,
    perM2: 4000,
    ...over,
  };
}

describe('priceIndexSamples', () => {
  it('counts a two-source property once, at its lowest live price', () => {
    const { live, exited } = priceIndexSamples([
      row({ postingId: 'a', pricePen: 420_000, perM2: 4200 }),
      row({ postingId: 'b', pricePen: 400_000, perM2: 4000 }),
    ]);
    assert.deepEqual(live.get('2026-11-09'), [4000]);
    assert.equal(exited.size, 0);
  });

  it('does not exit while another copy is live', () => {
    const { live, exited } = priceIndexSamples([
      row({ postingId: 'a' }),
      row({ postingId: 'b', live: false, liveWeeks: [], lastSeenAt: new Date('2026-10-01T00:00:00Z') }),
    ]);
    assert.equal(exited.size, 0);
    assert.equal(live.get('2026-11-09')?.length, 1);
  });

  it('exits on the last copy to go, in that copy week, at the lowest price', () => {
    const { live, exited } = priceIndexSamples([
      row({ postingId: 'a', live: false, liveWeeks: [], lastSeenAt: new Date('2026-10-01T00:00:00Z'), pricePen: 430_000, perM2: 4300 }),
      row({ postingId: 'b', live: false, liveWeeks: [], lastSeenAt: new Date('2026-11-04T00:00:00Z'), pricePen: 410_000, perM2: 4100 }),
    ]);
    assert.equal(live.size, 0);
    assert.deepEqual([...exited.entries()], [['2026-11-02', [4100]]]);
  });

  it('an unusable live copy keeps the property live without speaking for its price', () => {
    const { live, exited } = priceIndexSamples([
      row({ postingId: 'a', perM2: null, pricePen: 0 }),
      row({ postingId: 'b', live: false, liveWeeks: [] }),
    ]);
    assert.equal(live.size, 0);
    assert.equal(exited.size, 0);
  });
});

describe('perPropertyPerM2', () => {
  it('gives one value per property, from the lowest-priced copy', () => {
    const values = perPropertyPerM2([
      { postingId: 'a', propertyId: 'P', pricePen: 420_000, perM2: 4200 },
      { postingId: 'b', propertyId: 'P', pricePen: 400_000, perM2: 4000 },
      { postingId: 'c', propertyId: null, pricePen: 300_000, perM2: 3000 },
    ]);
    assert.deepEqual(values.sort(), [3000, 4000]);
  });
});

describe('collapseProjects', () => {
  it('counts one project across two sources once', () => {
    const rows = collapseProjects([
      { postingId: 'n1', projectId: 'J', districtSlug: 'lince', developmentStage: null, unitsCount: 40 },
      { postingId: 'p1', projectId: 'J', districtSlug: 'lince', developmentStage: 'En planos', unitsCount: null },
      { postingId: 'x1', projectId: null, districtSlug: 'lince', developmentStage: null, unitsCount: null },
      { postingId: 'x2', projectId: null, districtSlug: 'lince', developmentStage: null, unitsCount: null },
    ]);
    assert.equal(rows.length, 3);
    const merged = rows.find((r) => r.unitsCount === 40)!;
    assert.equal(merged.developmentStage, 'En planos');
  });
});
