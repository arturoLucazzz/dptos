import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runLocationRefresh } from './location-hook';

test('a refresh failure is recorded and never thrown', async () => {
  const recorded: string[] = [];
  await runLocationRefresh(
    async () => {
      throw new Error('db down');
    },
    async (message) => {
      recorded.push(message);
    },
  );
  assert.deepEqual(recorded, ['location refresh failed: db down']);
});

test('a failure while recording the failure is swallowed too', async () => {
  await assert.doesNotReject(
    runLocationRefresh(
      async () => {
        throw new Error('db down');
      },
      async () => {
        throw new Error('still down');
      },
    ),
  );
});

test('a successful refresh returns its counts', async () => {
  const counts = await runLocationRefresh(async () => ({ scored: 3, outsideLima: 1, noCoordinates: 0 }), async () => {});
  assert.deepEqual(counts, { scored: 3, outsideLima: 1, noCoordinates: 0 });
});
