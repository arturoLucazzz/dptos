import { test } from 'node:test';
import assert from 'node:assert/strict';

test('invalidateSaleListings clears every derived memo', async () => {
  // lib/db builds its client on import; the pool connects lazily, so a placeholder URL is enough.
  process.env.DATABASE_URL ??= 'postgresql://unused@localhost:5432/unused';
  const { invalidateSaleListings } = await import('./listings');
  const g = globalThis as Record<string, unknown>;
  const keys = ['__saleListingsMemo', '__projectRowsMemo', '__marketDashboardMemo'];
  for (const k of keys) g[k] = { marker: true };
  invalidateSaleListings();
  for (const k of keys) assert.equal(g[k], undefined, k);
});
