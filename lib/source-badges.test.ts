import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceBadges } from './source-badges';

test('one badge per portal, in the fixed order', () => {
  const b = sourceBadges([
    { source: 'nexo', url: 'https://n/1' },
    { source: 'urbania', url: null },
    { source: 'urbania', url: 'https://u/2' },
    { source: null, url: 'https://x' },
  ]);
  assert.deepEqual(b, [
    { source: 'urbania', label: 'Urbania', url: 'https://u/2' },
    { source: 'nexo', label: 'Nexo', url: 'https://n/1' },
  ]);
});

test('no copies gives no badges', () => assert.deepEqual(sourceBadges([]), []));
