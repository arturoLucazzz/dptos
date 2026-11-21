import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from './paginate';

const items = Array.from({ length: 120 }, (_, i) => i);

describe('paginate', () => {
  it('slices the requested page and reports the total', () => {
    const p = paginate(items, '2', 50);
    assert.equal(p.items[0], 50);
    assert.equal(p.items.length, 50);
    assert.equal(p.page, 2);
    assert.equal(p.pageCount, 3);
    assert.equal(p.total, 120);
  });

  it('the last page holds the rest', () => {
    assert.equal(paginate(items, '3', 50).items.length, 20);
  });

  it('falls back to 1 for missing or bad values', () => {
    for (const bad of [undefined, '', 'x', '0', '-2', '1.5', ['2', '3']]) {
      assert.equal(paginate(items, bad, 50).page, 1, String(bad));
    }
  });

  it('clamps a page past the end to the last page', () => {
    const p = paginate(items, '99', 50);
    assert.equal(p.page, 3);
    assert.equal(p.items.length, 20);
  });

  it('an empty list is one empty page', () => {
    const p = paginate([], '1', 50);
    assert.deepEqual([p.items, p.page, p.pageCount, p.total], [[], 1, 1, 0]);
  });
});
