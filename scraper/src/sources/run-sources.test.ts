import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crawlIsComplete, parseAcceptGate, sourcesToRecord } from './run-sources';

describe('sourcesToRecord', () => {
  it('records a source that crawled cleanly', () => {
    assert.deepEqual(sourcesToRecord([{ source: 'urbania', crawled: true, failed: false, gatedSlices: 0 }]), {
      recorded: ['urbania'],
      leftOut: [],
    });
  });

  it('leaves out a source that failed', () => {
    assert.deepEqual(sourcesToRecord([{ source: 'urbania', crawled: true, failed: true, gatedSlices: 0 }]), {
      recorded: [],
      leftOut: [{ source: 'urbania', reason: 'failed' }],
    });
  });

  it('leaves out a source with a gated slice', () => {
    assert.deepEqual(sourcesToRecord([{ source: 'proper', crawled: true, failed: false, gatedSlices: 1 }]), {
      recorded: [],
      leftOut: [{ source: 'proper', reason: 'sanity gate' }],
    });
  });

  it('leaves out a source that crawled nothing', () => {
    assert.deepEqual(sourcesToRecord([{ source: 'remax', crawled: false, failed: false, gatedSlices: 0 }]), {
      recorded: [],
      leftOut: [{ source: 'remax', reason: 'nothing crawled' }],
    });
  });

  it('judges each source on its own', () => {
    const result = sourcesToRecord([
      { source: 'urbania', crawled: true, failed: false, gatedSlices: 2 },
      { source: 'proper', crawled: true, failed: false, gatedSlices: 0 },
    ]);
    assert.deepEqual(result.recorded, ['proper']);
  });
});

describe('crawlIsComplete', () => {
  const district = (districtSlug: string) => ({
    districtSlug,
    pagesFetched: 1,
    blocked: false,
    errors: [],
    claimedTotal: null,
  });

  it('complete when every requested district came back', () => {
    const result = { districts: [district('lince'), district('surquillo')], skippedOutsideLima: 0, incomplete: false };
    assert.equal(crawlIsComplete(['lince', 'surquillo'], result), true);
  });

  it('not complete when a requested district came back blocked or with errors', () => {
    const blocked = { districts: [district('lince'), { ...district('surquillo'), blocked: true }], skippedOutsideLima: 0, incomplete: false };
    assert.equal(crawlIsComplete(['lince', 'surquillo'], blocked), false);
    const errored = { districts: [district('lince'), { ...district('surquillo'), errors: ['page 3: HTTP 500'] }], skippedOutsideLima: 0, incomplete: false };
    assert.equal(crawlIsComplete(['lince', 'surquillo'], errored), false);
  });

  it('errors in a district that was not asked for do not fail the crawl', () => {
    const result = { districts: [district('lince'), { ...district('barranco'), errors: ['x'] }], skippedOutsideLima: 0, incomplete: false };
    assert.equal(crawlIsComplete(['lince'], result), true);
  });

  it('not complete when the adapter stopped early', () => {
    const result = { districts: [district('lince')], skippedOutsideLima: 0, incomplete: true };
    assert.equal(crawlIsComplete(['lince'], result), false);
  });

  it('not complete when a requested district is missing', () => {
    const result = { districts: [district('lince')], skippedOutsideLima: 0, incomplete: false };
    assert.equal(crawlIsComplete(['lince', 'surquillo'], result), false);
  });

  it('matches the slug the scraper builds from what was typed', () => {
    const result = { districts: [district('san-isidro')], skippedOutsideLima: 0, incomplete: false };
    assert.equal(crawlIsComplete(['San Isidro'], result), true);
  });
});

describe('parseAcceptGate', () => {
  it('reads repeated flags and comma lists', () => {
    const accepted = parseAcceptGate(['--accept-gate=urbania:lince,proper:surco', '--dry-run', '--accept-gate=remax:barranco']);
    assert.deepEqual([...accepted].sort(), ['proper:surco', 'remax:barranco', 'urbania:lince']);
  });

  it('nothing when the flag is absent', () => assert.equal(parseAcceptGate(['--dry-run']).size, 0));

  it('rejects a value without a source and a district', () => {
    assert.throws(() => parseAcceptGate(['--accept-gate=lince']), /source:district/);
  });
});
