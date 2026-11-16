import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sourcesToRecord } from './run-sources';

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
