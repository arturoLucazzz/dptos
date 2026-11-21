import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FILTERS, type InvestmentFilters } from './investments/filters';
import { groupProjectPostings, queryProjects, type ProjectPostingInput, type ProjectRow } from './project-rows';

function posting(partial: Partial<ProjectPostingInput> & { id: string }): ProjectPostingInput {
  return {
    source: 'urbania',
    sourcePath: null,
    firstSeenAt: new Date('2026-01-01T00:00:00Z'),
    project: { id: 'p1', name: 'Torre Uno', districtSlug: 'miraflores', latitude: -12.1, longitude: -77.03, deliveryDate: '2028', stage: 'En planos' },
    currentSnapshot: { pricePen: 500000, imageUrl: null, sourceUrl: null, firstDateOnline: null },
    ...partial,
  };
}

function prow(partial: Partial<ProjectRow> & { projectId: string }): ProjectRow {
  return {
    name: partial.projectId,
    districtSlug: 'miraflores',
    districtName: 'Miraflores',
    priceFromPen: 100,
    deliveryDate: null,
    stage: null,
    imageUrl: null,
    url: null,
    lat: null,
    lon: null,
    postingIds: [],
    newestAt: null,
    sources: [],
    ...partial,
  };
}

const filters = (p: Partial<InvestmentFilters>): InvestmentFilters => ({ ...DEFAULT_FILTERS, ...p });

describe('groupProjectPostings', () => {
  it('gives one row with the lower price for two postings of one project', () => {
    const rows = groupProjectPostings([
      posting({ id: 'a', currentSnapshot: { pricePen: 600000, imageUrl: 'a.jpg', sourceUrl: 'https://a', firstDateOnline: null } }),
      posting({ id: 'b', currentSnapshot: { pricePen: 450000, imageUrl: 'b.jpg', sourceUrl: 'https://b', firstDateOnline: null } }),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].priceFromPen, 450000);
    assert.deepEqual([...rows[0].postingIds].sort(), ['a', 'b']);
    assert.equal(rows[0].imageUrl, 'b.jpg');
    assert.equal(rows[0].url, 'https://b');
    assert.equal(rows[0].districtName, 'Miraflores');
    assert.equal(rows[0].lat, -12.1);
  });

  it('gives one badge per portal of the project', () => {
    const rows = groupProjectPostings([
      posting({ id: 'a', source: 'nexo', currentSnapshot: { pricePen: 600000, imageUrl: null, sourceUrl: 'https://n', firstDateOnline: null } }),
      posting({ id: 'b', source: 'proper', currentSnapshot: { pricePen: 500000, imageUrl: null, sourceUrl: 'https://p', firstDateOnline: null } }),
    ]);
    assert.deepEqual(rows[0].sources.map((b) => b.label), ['Proper', 'Nexo']);
  });

  it('drops a posting with no project', () => {
    assert.deepEqual(groupProjectPostings([posting({ id: 'a', project: null })]), []);
  });

  it('has a null price for a project with no price', () => {
    const rows = groupProjectPostings([
      posting({ id: 'a', currentSnapshot: { pricePen: null, imageUrl: null, sourceUrl: null, firstDateOnline: null } }),
    ]);
    assert.equal(rows[0].priceFromPen, null);
  });

  it('takes the newest date among the postings', () => {
    const rows = groupProjectPostings([
      posting({ id: 'a', firstSeenAt: new Date('2026-01-01T00:00:00Z') }),
      posting({ id: 'b', firstSeenAt: new Date('2026-03-01T00:00:00Z') }),
    ]);
    assert.equal(rows[0].newestAt, '2026-03-01T00:00:00.000Z');
  });
});

describe('queryProjects', () => {
  const rows = [
    prow({ projectId: 'a', districtSlug: 'miraflores', priceFromPen: 300, lat: -12.1, lon: -77.03, newestAt: '2026-01-01T00:00:00.000Z' }),
    prow({ projectId: 'b', districtSlug: 'barranco', priceFromPen: 100, lat: 0, lon: 0, newestAt: '2026-05-01T00:00:00.000Z' }),
    prow({ projectId: 'c', districtSlug: 'miraflores', priceFromPen: null }),
    prow({ projectId: 'd', districtSlug: 'miraflores', priceFromPen: 200, lat: null, lon: null }),
  ];
  const ids = (r: { rows: ProjectRow[] }) => r.rows.map((x) => x.projectId);

  it('filters by district and price range', () => {
    assert.deepEqual(ids(queryProjects(rows, filters({ districts: ['barranco'], sort: 'pricePen', order: 'asc' }), 1, 10)), ['b']);
    assert.deepEqual(ids(queryProjects(rows, filters({ priceMin: 150, priceMax: 250, sort: 'pricePen', order: 'asc' }), 1, 10)), ['d']);
  });

  it('filters by area and drops rows without coordinates', () => {
    const ring: [number, number][] = [[-77.1, -12.2], [-76.9, -12.2], [-76.9, -12.0], [-77.1, -12.0], [-77.1, -12.2]];
    const r = queryProjects(rows, filters({ area: ring, sort: 'pricePen', order: 'asc' }), 1, 10);
    assert.deepEqual(ids(r), ['a']);
    assert.equal(r.total, 1);
  });

  it('ignores bedrooms, sources and location', () => {
    const r = queryProjects(rows, filters({ bedroomsMin: 3, sources: ['urbania'], locationMin: 90, sort: 'pricePen', order: 'asc' }), 1, 10);
    assert.equal(r.total, 4);
  });

  it('sorts by price with nulls last in both orders', () => {
    assert.deepEqual(ids(queryProjects(rows, filters({ sort: 'pricePen', order: 'asc' }), 1, 10)), ['b', 'd', 'a', 'c']);
    assert.deepEqual(ids(queryProjects(rows, filters({ sort: 'pricePerM2', order: 'desc' }), 1, 10)), ['a', 'd', 'b', 'c']);
  });

  it('falls back to price ascending for other sorts, ignoring order', () => {
    assert.deepEqual(ids(queryProjects(rows, filters({ sort: 'monthlyGain', order: 'desc' }), 1, 10)), ['b', 'd', 'a', 'c']);
  });

  it('sorts by the newest posting, undated last', () => {
    assert.deepEqual(ids(queryProjects(rows, filters({ sort: 'newest', order: 'asc' }), 1, 10)), ['b', 'a', 'c', 'd']);
    assert.deepEqual(ids(queryProjects(rows, filters({ sort: 'newest', order: 'desc' }), 1, 10)), ['a', 'b', 'c', 'd']);
  });

  it('pages the result and reports the total', () => {
    const r = queryProjects(rows, filters({ sort: 'pricePen', order: 'asc' }), 2, 3);
    assert.deepEqual(ids(r), ['c']);
    assert.equal(r.total, 4);
  });
});
