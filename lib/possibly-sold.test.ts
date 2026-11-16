import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coveredSlices,
  cutoffsFromRuns,
  isLivePosting,
  isPossiblySold,
  livePostingWhere,
  notLivePostingWhere,
  sliceKey,
  type FinishedRun,
} from './possibly-sold';

const day = (d: number) => new Date(Date.UTC(2026, 10, d));

/** A run in the per-source shape: `{ source: [district, ...] }`, SALE and RENT counted. */
function run(d: number, slices: Record<string, string[]>, sources = Object.keys(slices)): FinishedRun {
  const districtCounts: Record<string, Record<string, Record<string, number>>> = {};
  for (const [source, districts] of Object.entries(slices)) {
    districtCounts[source] = Object.fromEntries(districts.map((district) => [district, { SALE: 5, RENT: 2 }]));
  }
  return { startedAt: day(d), sources, districtCounts };
}

const urbaniaLince = (op = 'SALE') => sliceKey('urbania', 'lince', op);

describe('coveredSlices', () => {
  it('each recorded source, each district and operation it counted', () => {
    const slices = coveredSlices({
      sources: ['urbania', 'proper'],
      districtCounts: { urbania: { lince: { SALE: 3 } }, proper: { lince: { SALE: 0 }, barranco: { SALE: 1 } } },
    });
    assert.deepEqual(slices.sort(), [
      sliceKey('proper', 'barranco', 'SALE'),
      sliceKey('proper', 'lince', 'SALE'),
      urbaniaLince(),
    ]);
  });

  it('a source counted but not recorded (gated, failed) covers nothing', () => {
    assert.deepEqual(coveredSlices({ sources: ['proper'], districtCounts: { urbania: { lince: { SALE: 3 } } } }), []);
  });

  it('old flat runs cover urbania in their districts', () => {
    assert.deepEqual(coveredSlices({ sources: [], districtCounts: { lince: { SALE: 3, RENT: 1 } } }).sort(), [
      urbaniaLince('RENT'),
      urbaniaLince('SALE'),
    ]);
  });

  it('a per-source run with no sources (a replay) covers nothing', () => {
    assert.deepEqual(coveredSlices({ sources: [], districtCounts: { urbania: { lince: { SALE: 3 } } } }), []);
  });

  it('manual runs cover nothing', () => {
    assert.deepEqual(coveredSlices({ sources: ['manual'], districtCounts: { manual: { lince: { SALE: 1 } } } }), []);
  });
});

describe('cutoffsFromRuns', () => {
  it('takes the 3rd newest run that covered each slice', () => {
    const cutoffs = cutoffsFromRuns([
      run(10, { urbania: ['lince'], proper: ['lince'] }),
      run(9, { urbania: ['lince'] }),
      run(8, { urbania: ['lince'], proper: ['lince'] }),
      run(7, { urbania: ['lince'] }),
      run(6, { proper: ['lince'] }),
    ]);
    assert.equal(cutoffs.get(urbaniaLince())?.getTime(), day(8).getTime());
    assert.equal(cutoffs.get(sliceKey('proper', 'lince', 'SALE'))?.getTime(), day(6).getTime());
  });

  it('a daily run of other districts does not age a district it skipped', () => {
    // Weekly covered barranco once; three dailies covered only lince.
    const cutoffs = cutoffsFromRuns([
      run(10, { urbania: ['lince'] }),
      run(9, { urbania: ['lince'] }),
      run(8, { urbania: ['lince'] }),
      run(7, { urbania: ['lince', 'barranco'] }),
    ]);
    assert.equal(cutoffs.get(urbaniaLince())?.getTime(), day(8).getTime());
    assert.equal(cutoffs.has(sliceKey('urbania', 'barranco', 'SALE')), false);
  });

  it('a sale-only run does not age rent listings', () => {
    const saleOnly = (d: number): FinishedRun => ({
      startedAt: day(d),
      sources: ['urbania'],
      districtCounts: { urbania: { lince: { SALE: 5 } } },
    });
    const cutoffs = cutoffsFromRuns([saleOnly(3), saleOnly(2), saleOnly(1)]);
    assert.equal(cutoffs.has(urbaniaLince('SALE')), true);
    assert.equal(cutoffs.has(urbaniaLince('RENT')), false);
  });

  it('does not depend on the order runs arrive in', () => {
    const cutoffs = cutoffsFromRuns([
      run(1, { urbania: ['lince'] }),
      run(3, { urbania: ['lince'] }),
      run(2, { urbania: ['lince'] }),
      run(4, { urbania: ['lince'] }),
    ]);
    assert.equal(cutoffs.get(urbaniaLince())?.getTime(), day(2).getTime());
  });

  it('old flat runs count as urbania only', () => {
    const flat = (d: number): FinishedRun => ({ startedAt: day(d), sources: [], districtCounts: { lince: { SALE: 3 } } });
    const cutoffs = cutoffsFromRuns([flat(3), flat(2), run(1, { urbania: ['lince'] })]);
    assert.deepEqual([...cutoffs.keys()], [urbaniaLince()]);
    assert.equal(cutoffs.get(urbaniaLince())?.getTime(), day(1).getTime());
  });

  it('replays and runs that leave a source out never age that source', () => {
    const replay = (d: number) => run(d, { urbania: ['lince'] }, []);
    const cutoffs = cutoffsFromRuns([
      replay(6),
      run(5, { proper: ['lince'], urbania: ['lince'] }, ['proper']),
      replay(4),
      run(3, { urbania: ['lince'] }),
      run(2, { urbania: ['lince'] }),
    ]);
    assert.equal(cutoffs.has(urbaniaLince()), false);
  });

  it('manual never gets a cutoff, and unknown names are ignored', () => {
    const cutoffs = cutoffsFromRuns([
      run(3, { manual: ['lince'], zillow: ['lince'] }),
      run(2, { manual: ['lince'], zillow: ['lince'] }),
      run(1, { manual: ['lince'], zillow: ['lince'] }),
    ]);
    assert.equal(cutoffs.size, 0);
  });

  it('gives nothing on day one', () => assert.equal(cutoffsFromRuns([]).size, 0));
});

describe('isPossiblySold and isLivePosting', () => {
  const cutoffs = new Map([[urbaniaLince(), day(8)]]);
  const posting = (over: Partial<Parameters<typeof isPossiblySold>[0]> = {}) => ({
    source: 'urbania',
    districtSlug: 'lince',
    operation: 'SALE',
    lastSeenAt: day(7),
    removedAt: null,
    ...over,
  });

  it('a posting seen before its slice cutoff is possibly sold', () => {
    assert.equal(isPossiblySold(posting(), cutoffs), true);
    assert.equal(isLivePosting(posting(), cutoffs), false);
  });

  it('a posting seen at or after the cutoff is live', () => {
    assert.equal(isPossiblySold(posting({ lastSeenAt: day(8) }), cutoffs), false);
    assert.equal(isLivePosting(posting({ lastSeenAt: day(8) }), cutoffs), true);
  });

  it('a slice without a cutoff is live however old', () => {
    assert.equal(isPossiblySold(posting({ source: 'proper', lastSeenAt: day(1) }), cutoffs), false);
    assert.equal(isPossiblySold(posting({ districtSlug: 'barranco', lastSeenAt: day(1) }), cutoffs), false);
    assert.equal(isPossiblySold(posting({ operation: 'RENT', lastSeenAt: day(1) }), cutoffs), false);
  });

  it('a removed posting is not live and not possibly sold', () => {
    const removed = posting({ source: 'manual', lastSeenAt: day(9), removedAt: day(9) });
    assert.equal(isPossiblySold(removed, cutoffs), false);
    assert.equal(isLivePosting(removed, cutoffs), false);
  });
});

describe('livePostingWhere', () => {
  it('one branch per source, operation and cutoff; slices without a cutoff are live', () => {
    const cutoffs = new Map([
      [sliceKey('urbania', 'lince', 'SALE'), day(8)],
      [sliceKey('urbania', 'surquillo', 'SALE'), day(8)],
      [sliceKey('proper', 'lince', 'SALE'), day(6)],
    ]);
    assert.deepEqual(livePostingWhere(cutoffs), {
      removedAt: null,
      OR: [
        { source: 'proper', operation: 'SALE', districtSlug: { in: ['lince'] }, lastSeenAt: { gte: day(6) } },
        { source: 'urbania', operation: 'SALE', districtSlug: { in: ['lince', 'surquillo'] }, lastSeenAt: { gte: day(8) } },
        {
          NOT: {
            OR: [
              { source: 'proper', operation: 'SALE', districtSlug: { in: ['lince'] } },
              { source: 'urbania', operation: 'SALE', districtSlug: { in: ['lince', 'surquillo'] } },
            ],
          },
        },
      ],
    });
  });

  it('without cutoffs only removal hides a posting', () => {
    assert.deepEqual(livePostingWhere(new Map()), { removedAt: null });
  });
});

describe('notLivePostingWhere', () => {
  it('removed, or seen before its own slice cutoff', () => {
    assert.deepEqual(notLivePostingWhere(new Map([[urbaniaLince(), day(8)]])), {
      OR: [
        { removedAt: { not: null } },
        { source: 'urbania', operation: 'SALE', districtSlug: { in: ['lince'] }, lastSeenAt: { lt: day(8) } },
      ],
    });
  });

  it('without cutoffs only removed postings', () => {
    assert.deepEqual(notLivePostingWhere(new Map()), { OR: [{ removedAt: { not: null } }] });
  });
});
