import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cutoffsFromRuns,
  isLivePosting,
  isPossiblySold,
  livePostingWhere,
  notLivePostingWhere,
} from './possibly-sold';

const day = (d: number) => new Date(Date.UTC(2026, 10, d));

describe('cutoffsFromRuns', () => {
  it('takes the 3rd newest run that covered each source', () => {
    const cutoffs = cutoffsFromRuns([
      { startedAt: day(10), sources: ['urbania', 'proper'] },
      { startedAt: day(9), sources: ['urbania'] },
      { startedAt: day(8), sources: ['urbania', 'proper'] },
      { startedAt: day(7), sources: ['urbania'] },
      { startedAt: day(6), sources: ['proper'] },
    ]);
    assert.deepEqual(cutoffs, { urbania: day(8), proper: day(6) });
  });

  it('does not depend on the order runs arrive in', () => {
    const cutoffs = cutoffsFromRuns([
      { startedAt: day(1), sources: ['urbania'] },
      { startedAt: day(3), sources: ['urbania'] },
      { startedAt: day(2), sources: ['urbania'] },
      { startedAt: day(4), sources: ['urbania'] },
    ]);
    assert.deepEqual(cutoffs, { urbania: day(2) });
  });

  it('runs from before sources existed count as urbania only', () => {
    const cutoffs = cutoffsFromRuns([
      { startedAt: day(3), sources: [] },
      { startedAt: day(2), sources: [] },
      { startedAt: day(1), sources: ['urbania'] },
    ]);
    assert.deepEqual(cutoffs, { urbania: day(1) });
  });

  it('runs that leave a source out never age that source', () => {
    const cutoffs = cutoffsFromRuns([
      { startedAt: day(5), sources: ['proper'] },
      { startedAt: day(4), sources: ['proper'] },
      { startedAt: day(3), sources: ['proper'] },
      { startedAt: day(2), sources: ['urbania'] },
      { startedAt: day(1), sources: ['urbania'] },
    ]);
    assert.deepEqual(cutoffs, { proper: day(3) });
  });

  it('manual never gets a cutoff, and unknown names are ignored', () => {
    const cutoffs = cutoffsFromRuns([
      { startedAt: day(3), sources: ['manual', 'zillow'] },
      { startedAt: day(2), sources: ['manual', 'zillow'] },
      { startedAt: day(1), sources: ['manual', 'zillow'] },
    ]);
    assert.deepEqual(cutoffs, {});
  });

  it('gives nothing on day one', () => assert.deepEqual(cutoffsFromRuns([]), {}));
});

describe('isPossiblySold and isLivePosting', () => {
  const cutoffs = { urbania: day(8) };

  it('a posting seen before its source cutoff is possibly sold', () => {
    const posting = { source: 'urbania', lastSeenAt: day(7), removedAt: null };
    assert.equal(isPossiblySold(posting, cutoffs), true);
    assert.equal(isLivePosting(posting, cutoffs), false);
  });

  it('a posting seen at or after the cutoff is live', () => {
    const posting = { source: 'urbania', lastSeenAt: day(8), removedAt: null };
    assert.equal(isPossiblySold(posting, cutoffs), false);
    assert.equal(isLivePosting(posting, cutoffs), true);
  });

  it('a source without a cutoff is live however old', () => {
    const posting = { source: 'proper', lastSeenAt: day(1), removedAt: null };
    assert.equal(isPossiblySold(posting, cutoffs), false);
    assert.equal(isLivePosting(posting, cutoffs), true);
  });

  it('a removed posting is not live and not possibly sold', () => {
    const posting = { source: 'manual', lastSeenAt: day(9), removedAt: day(9) };
    assert.equal(isPossiblySold(posting, cutoffs), false);
    assert.equal(isLivePosting(posting, cutoffs), false);
  });
});

describe('livePostingWhere', () => {
  it('one branch per source with a cutoff, every other source live', () => {
    assert.deepEqual(livePostingWhere({ urbania: day(8), proper: day(6) }), {
      removedAt: null,
      OR: [
        { source: 'urbania', lastSeenAt: { gte: day(8) } },
        { source: 'proper', lastSeenAt: { gte: day(6) } },
        { source: { notIn: ['urbania', 'proper'] } },
      ],
    });
  });

  it('without cutoffs only removal hides a posting', () => {
    assert.deepEqual(livePostingWhere({}), { removedAt: null });
  });
});

describe('notLivePostingWhere', () => {
  it('removed, or seen before its own source cutoff', () => {
    assert.deepEqual(notLivePostingWhere({ urbania: day(8) }), {
      OR: [{ removedAt: { not: null } }, { source: 'urbania', lastSeenAt: { lt: day(8) } }],
    });
  });

  it('without cutoffs only removed postings', () => {
    assert.deepEqual(notLivePostingWhere({}), { OR: [{ removedAt: { not: null } }] });
  });
});
