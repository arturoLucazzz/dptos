import test from 'node:test';
import assert from 'node:assert/strict';
import {
  districtMarket,
  exitDate,
  priceHistogram,
  repeatedAcrossPortals,
  sourceStats,
  topYieldSlugs,
  type DistrictMarket,
} from './market-dashboard';
import { sliceKey } from './possibly-sold';

test('districtMarket takes medians per district and leaves a missing rent null', () => {
  const rows = districtMarket(
    [
      { districtSlug: 'miraflores', districtName: 'Miraflores', pricePen: 400_000, grossRentPen: 2_000 },
      { districtSlug: 'miraflores', districtName: 'Miraflores', pricePen: 600_000, grossRentPen: 3_000 },
      { districtSlug: 'miraflores', districtName: 'Miraflores', pricePen: 500_000, grossRentPen: null },
      { districtSlug: 'lince', districtName: 'Lince', pricePen: 250_000, grossRentPen: null },
    ],
    [
      { districtSlug: 'miraflores', pricePen: 2_000 },
      { districtSlug: 'miraflores', pricePen: 2_400 },
    ],
  );
  assert.deepEqual(rows.map((r) => r.slug), ['miraflores', 'lince']);
  const [mira, lince] = rows;
  assert.equal(mira.typicalSalePen, 500_000);
  assert.equal(mira.typicalRentPen, 2_200);
  assert.equal(mira.rentCount, 2);
  assert.equal(mira.saleCount, 3);
  assert.equal(mira.grossYieldPct, 6); // both 6% yields
  assert.equal(lince.typicalRentPen, null);
  assert.equal(lince.grossYieldPct, null);
  assert.equal(lince.rentCount, 0);
});

const row = (slug: string, y: number | null, saleCount: number): DistrictMarket => ({
  slug,
  name: slug,
  typicalSalePen: 1,
  typicalRentPen: null,
  grossYieldPct: y,
  saleCount,
  rentCount: 0,
});

test('topYieldSlugs skips nulls and districts with fewer than 20 sales', () => {
  const rows = [row('a', 7, 30), row('b', null, 50), row('c', 9, 19), row('d', 6, 20), row('e', 5, 40), row('f', 4, 40)];
  assert.deepEqual(topYieldSlugs(rows), ['a', 'd', 'e']);
  assert.deepEqual(topYieldSlugs(rows, 1), ['a']);
});

test('priceHistogram bins prices and labels them', () => {
  const bins = priceHistogram([50_000, 350_000, 399_999, 2_500_000]);
  const count = (label: string) => bins.find((b) => b.label === label)?.count;
  assert.equal(count('S/ 0–100 mil'), 1);
  assert.equal(count('S/ 300–400 mil'), 2);
  assert.equal(count('S/ 2 M o más'), 1);
  assert.equal(bins.length, 21);
  assert.equal(bins[0].label, 'S/ 0–100 mil');
  assert.equal(bins[3].label, 'S/ 300–400 mil');
  assert.equal(bins[10].label, 'S/ 1,0–1,1 M');
  assert.equal(bins.at(-1)?.label, 'S/ 2 M o más');
  assert.equal(bins.reduce((s, b) => s + b.count, 0), 4);
  assert.equal(bins.at(-1)?.to, null);
});

test('repeatedAcrossPortals counts properties listed on two or more portals', () => {
  assert.equal(
    repeatedAcrossPortals([
      { copies: [{ source: 'urbania' }, { source: 'nexo' }] },
      { copies: [{ source: 'urbania' }, { source: 'urbania' }] },
      { copies: [{ source: 'proper' }] },
    ]),
    1,
  );
});

test('sourceStats counts live, new and gone postings per source', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const day = 86_400_000;
  const ago = (d: number) => new Date(now.getTime() - d * day);
  const cutoffs = new Map([[sliceKey('urbania', 'lince', 'SALE'), ago(2)]]);
  const base = { districtSlug: 'lince', operation: 'SALE', removedAt: null, kind: 'UNIT' as const };
  const stats = sourceStats(
    [
      { ...base, source: 'urbania', pricePen: 200_000, firstSeenAt: ago(30), lastSeenAt: ago(0) },
      { ...base, source: 'urbania', pricePen: 400_000, firstSeenAt: ago(3), lastSeenAt: ago(1) },
      // behind the cutoff, last seen 4 days ago: left within the week
      { ...base, source: 'urbania', pricePen: 100_000, firstSeenAt: ago(60), lastSeenAt: ago(4) },
      // behind the cutoff for a long time: gone before the window
      { ...base, source: 'urbania', pricePen: 100_000, firstSeenAt: ago(90), lastSeenAt: ago(20) },
      // removed 2 days ago, last seen long ago: left in the window by removal date
      { ...base, source: 'urbania', pricePen: 100_000, firstSeenAt: ago(90), lastSeenAt: ago(20), removedAt: ago(2) },
      { ...base, source: 'nexo', pricePen: 300_000, firstSeenAt: ago(10), lastSeenAt: ago(0) },
    ],
    cutoffs,
    now,
  );
  const urbania = stats.find((s) => s.source === 'urbania');
  assert.deepEqual(urbania, {
    source: 'urbania',
    label: 'Urbania',
    liveCount: 2,
    typicalSalePen: 300_000,
    newLast7: 1,
    goneLast7: 2,
  });
  assert.equal(stats.find((s) => s.source === 'nexo')?.liveCount, 1);
});

test('exitDate is removedAt, else lastSeenAt once the cutoff has passed it, else null', () => {
  const cutoffs = new Map([[sliceKey('urbania', 'lince', 'SALE'), new Date('2026-11-10T00:00:00Z')]]);
  const base = { source: 'urbania' as const, districtSlug: 'lince', operation: 'SALE' };
  const seen = new Date('2026-11-05T00:00:00Z');
  const removed = new Date('2026-11-18T00:00:00Z');
  assert.deepEqual(exitDate({ ...base, lastSeenAt: seen, removedAt: null }, cutoffs), seen);
  assert.deepEqual(exitDate({ ...base, lastSeenAt: seen, removedAt: removed }, cutoffs), removed);
  assert.equal(exitDate({ ...base, lastSeenAt: new Date('2026-11-12T00:00:00Z'), removedAt: null }, cutoffs), null);
});

test('sourceStats counts projects only for a source with no live units', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const day = 86_400_000;
  const ago = (d: number) => new Date(now.getTime() - d * day);
  const base = { districtSlug: 'lince', operation: 'SALE', removedAt: null, firstSeenAt: ago(30), lastSeenAt: ago(0) };
  const stats = sourceStats(
    [
      // Nexo publishes projects only
      { ...base, source: 'nexo', kind: 'PROJECT', pricePen: 150_000 },
      { ...base, source: 'nexo', kind: 'PROJECT', pricePen: 250_000 },
      { ...base, source: 'nexo', kind: 'PROJECT', pricePen: 350_000 },
      // Proper emits one project card plus one card per apartment: the units are the count
      { ...base, source: 'proper', kind: 'PROJECT', pricePen: 400_000 },
      { ...base, source: 'proper', kind: 'UNIT', pricePen: 600_000 },
      { ...base, source: 'proper', kind: 'UNIT', pricePen: 800_000 },
    ],
    new Map(),
    now,
  );
  const nexo = stats.find((s) => s.source === 'nexo');
  assert.equal(nexo?.liveCount, 3);
  assert.equal(nexo?.typicalSalePen, null);
  const proper = stats.find((s) => s.source === 'proper');
  assert.equal(proper?.liveCount, 2);
  assert.equal(proper?.typicalSalePen, 700_000);
});

test('sourceStats applies the same rule to new and gone counts', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const day = 86_400_000;
  const ago = (d: number) => new Date(now.getTime() - d * day);
  const base = { districtSlug: 'lince', operation: 'SALE', source: 'proper' as const, pricePen: 1, lastSeenAt: ago(0) };
  const [proper] = sourceStats(
    [
      { ...base, kind: 'PROJECT', firstSeenAt: ago(1), removedAt: null },
      { ...base, kind: 'UNIT', firstSeenAt: ago(2), removedAt: null },
      { ...base, kind: 'PROJECT', firstSeenAt: ago(40), removedAt: ago(1) },
      { ...base, kind: 'UNIT', firstSeenAt: ago(40), removedAt: ago(1) },
    ],
    new Map(),
    now,
  );
  assert.equal(proper.liveCount, 1);
  assert.equal(proper.newLast7, 1);
  assert.equal(proper.goneLast7, 1);
});
