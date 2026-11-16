import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countedDistricts,
  gateSkips,
  gateVerdict,
  previousCountForSource,
  previousCountFrom,
  previousTotalForSource,
  recordedSources,
  RUNS_TO_ACCEPT_DROP,
  sliceHistory,
  totalCountFrom,
  totalHistory,
} from './sanity-gate';

describe('previousCountFrom', () => {
  it('reads the new shape', () => {
    assert.equal(previousCountFrom({ remax: { lince: { SALE: 40 } } }, 'remax', 'lince', 'SALE'), 40);
    assert.equal(previousCountFrom({ remax: { lince: { SALE: 40 } } }, 'urbania', 'lince', 'SALE'), null);
    assert.equal(previousCountFrom({ remax: { lince: { SALE: 40 } } }, 'remax', 'lince', 'RENT'), null);
  });

  it('old shape is urbania only', () => {
    assert.equal(previousCountFrom({ lince: { SALE: 281 } }, 'urbania', 'lince', 'SALE'), 281);
    assert.equal(previousCountFrom({ lince: { SALE: 281 } }, 'adondevivir', 'lince', 'SALE'), null);
  });

  it('reads nothing from a missing or malformed value', () => {
    assert.equal(previousCountFrom(null, 'urbania', 'lince', 'SALE'), null);
    assert.equal(previousCountFrom('x', 'urbania', 'lince', 'SALE'), null);
    assert.equal(previousCountFrom({ lince: { SALE: 'many' } }, 'urbania', 'lince', 'SALE'), null);
  });
});

describe('gateSkips', () => {
  it('gate skips when a source collapses to zero', () => assert.equal(gateSkips(0, 281, 0.2), true));
  it('gate passes a normal run', () => assert.equal(gateSkips(270, 281, 0.2), false));
  it('gate passes the first run', () => assert.equal(gateSkips(0, null, 0.2), false));
  it('gate passes when the last count was zero', () => assert.equal(gateSkips(0, 0, 0.2), false));
});

describe('sliceHistory', () => {
  const runs = [
    { districtCounts: { urbania: { lince: { SALE: 40 } } }, skippedDistricts: ['urbania:lince:SALE'] },
    { districtCounts: { urbania: { surco: { SALE: 90 } } }, skippedDistricts: [] },
    { districtCounts: { urbania: { lince: { SALE: 0 } } }, skippedDistricts: ['urbania:lince:SALE'] },
    { districtCounts: { lince: { SALE: 281 } }, skippedDistricts: [] },
    { districtCounts: { lince: { SALE: 30 } }, skippedDistricts: ['lince:SALE'] },
  ];

  it('keeps only runs that observed the slice, newest first', () => {
    assert.deepEqual(sliceHistory(runs, 'urbania', 'lince', 'SALE'), [
      { observed: 40, gated: true },
      { observed: 0, gated: true },
      { observed: 281, gated: false },
      { observed: 30, gated: true },
    ]);
  });

  it('other sources do not read the old shape', () => {
    assert.deepEqual(sliceHistory(runs, 'proper', 'lince', 'SALE'), []);
  });
});

describe('gateVerdict', () => {
  const base = { observed: 40, previousCount: 281, ratio: 0.2, manualAccept: false };
  const gated40 = { observed: 40, gated: true };

  it('passes a normal count', () => {
    assert.equal(gateVerdict({ ...base, observed: 270, recent: [] }), 'pass');
  });

  it('skips a first collapse', () => {
    assert.equal(gateVerdict({ ...base, recent: [] }), 'skip');
    assert.equal(gateVerdict({ ...base, recent: [gated40] }), 'skip');
  });

  it('accepts the third collapse in a row', () => {
    assert.equal(gateVerdict({ ...base, recent: [gated40, gated40] }), 'auto-accepted');
  });

  it('never accepts zero on its own', () => {
    assert.equal(gateVerdict({ ...base, observed: 0, recent: [gated40, gated40] }), 'skip');
    assert.equal(gateVerdict({ ...base, recent: [gated40, { observed: 0, gated: true }] }), 'skip');
  });

  it('a normal run in between restarts the count', () => {
    assert.equal(gateVerdict({ ...base, recent: [gated40, { observed: 270, gated: false }, gated40] }), 'skip');
  });

  it('the manual override lets a collapse pass, even to zero', () => {
    assert.equal(gateVerdict({ ...base, observed: 0, recent: [], manualAccept: true }), 'manual-accepted');
  });

  it('the manual override does nothing to a count that passes', () => {
    assert.equal(gateVerdict({ ...base, observed: 270, recent: [], manualAccept: true }), 'pass');
  });
});

describe('recordedSources', () => {
  it('lists the run sources, ignoring unknown names', () => {
    assert.deepEqual(recordedSources({ urbania: {} }, ['urbania', 'zillow']), ['urbania']);
  });

  it('an empty list is urbania only for the old flat counts', () => {
    assert.deepEqual(recordedSources({ lince: { SALE: 3 } }, []), ['urbania']);
    // A replay or a run that recorded nothing: per-source counts, no sources.
    assert.deepEqual(recordedSources({ urbania: { lince: { SALE: 3 } } }, []), []);
    assert.deepEqual(recordedSources(null, []), []);
    assert.deepEqual(recordedSources({}, []), []);
  });
});

describe('countedDistricts', () => {
  it('reads the per-source and the old flat shapes', () => {
    assert.deepEqual(countedDistricts({ proper: { lince: {}, barranco: {} } }, 'proper'), ['lince', 'barranco']);
    assert.deepEqual(countedDistricts({ lince: { SALE: 1 } }, 'urbania'), ['lince']);
    assert.deepEqual(countedDistricts({ lince: { SALE: 1 } }, 'proper'), []);
  });
});

describe('previousCountForSource', () => {
  it('skips replays and runs that did not record the source', () => {
    const runs = [
      { sources: [], districtCounts: { urbania: { lince: { SALE: 999 } } } },
      { sources: ['proper'], districtCounts: { urbania: { lince: { SALE: 5 } }, proper: { lince: { SALE: 2 } } } },
      { sources: ['urbania'], districtCounts: { urbania: { lince: { SALE: 300 } } } },
    ];
    assert.equal(previousCountForSource(runs, 'urbania', 'lince', 'SALE'), 300);
    assert.equal(previousCountForSource(runs, 'proper', 'lince', 'SALE'), 2);
    assert.equal(previousCountForSource(runs, 'nexo', 'lince', 'SALE'), null);
  });

  it('old flat runs are urbania baselines', () => {
    assert.equal(previousCountForSource([{ sources: [], districtCounts: { lince: { SALE: 281 } } }], 'urbania', 'lince', 'SALE'), 281);
  });
});

describe('whole-site gate', () => {
  const counts = (byDistrict: Record<string, number>) => ({
    proper: Object.fromEntries(Object.entries(byDistrict).map(([d, n]) => [d, { SALE: n }])),
  });

  it('totals a source across every district it counted', () => {
    assert.equal(totalCountFrom(counts({ lince: 10, barranco: 0, miraflores: 30 }), 'proper', 'SALE'), 40);
    assert.equal(totalCountFrom(counts({ lince: 10 }), 'proper', 'RENT'), null);
    assert.equal(totalCountFrom(counts({ lince: 10 }), 'nexo', 'SALE'), null);
  });

  it('a district going to zero does not gate when the total holds', () => {
    const previous = previousTotalForSource(
      [{ sources: ['proper'], districtCounts: counts({ lince: 5, miraflores: 45 }) }],
      'proper',
      'SALE'
    );
    assert.equal(previous, 50);
    const observed = totalCountFrom(counts({ lince: 0, miraflores: 46 }), 'proper', 'SALE')!;
    assert.equal(gateVerdict({ observed, previousCount: previous, ratio: 0.2, recent: [], manualAccept: false }), 'pass');
  });

  it('a collapsed total skips, and the baseline skips runs that did not record the source', () => {
    const runs = [
      { sources: ['urbania'], districtCounts: counts({ lince: 1 }) },
      { sources: ['proper'], districtCounts: counts({ lince: 20, miraflores: 30 }) },
    ];
    const previous = previousTotalForSource(runs, 'proper', 'SALE');
    assert.equal(previous, 50);
    assert.equal(gateVerdict({ observed: 3, previousCount: previous, ratio: 0.2, recent: [], manualAccept: false }), 'skip');
  });

  it('a total collapsed in three runs in a row is accepted, zero never', () => {
    const gatedRuns = Array.from({ length: RUNS_TO_ACCEPT_DROP - 1 }, () => ({
      districtCounts: counts({ lince: 2, miraflores: 1 }),
      skippedDistricts: ['proper:all:SALE'],
    }));
    const recent = totalHistory(gatedRuns, 'proper', 'SALE');
    assert.deepEqual(recent, [
      { observed: 3, gated: true },
      { observed: 3, gated: true },
    ]);
    assert.equal(gateVerdict({ observed: 3, previousCount: 50, ratio: 0.2, recent, manualAccept: false }), 'auto-accepted');
    assert.equal(gateVerdict({ observed: 0, previousCount: 50, ratio: 0.2, recent, manualAccept: false }), 'skip');
    // A per-district skip key is not a whole-site skip.
    const perDistrict = totalHistory(
      [{ districtCounts: counts({ lince: 3 }), skippedDistricts: ['proper:lince:SALE'] }],
      'proper',
      'SALE'
    );
    assert.deepEqual(perDistrict, [{ observed: 3, gated: false }]);
  });
});
