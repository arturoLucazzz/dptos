import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestStats, periodEnd, periodYear } from './latest';

test('latestStats keeps the greatest period per place and indicator', () => {
  const m = latestStats([
    { place: 'lince', indicator: 'poverty_pct', value: 3, period: '2013', source: 'INEI 2013' },
    { place: 'lince', indicator: 'poverty_pct', value: 2, period: '2018', source: 'INEI 2018' },
    { place: 'lince', indicator: 'complaints_per_10k', value: 90, period: '2024-11..2025-10', source: 'SIDPOL' },
    { place: 'lince', indicator: 'complaints_per_10k', value: 80, period: '2025-06', source: 'SIDPOL' },
  ]);
  assert.equal(m.get('lince')!.get('poverty_pct')!.value, 2);
  assert.equal(m.get('lince')!.get('complaints_per_10k')!.value, 90); // window end 2025-10 beats 2025-06
});

test('periodEnd and periodYear', () => {
  assert.equal(periodEnd('2024-11..2025-10'), '2025-10');
  assert.equal(periodEnd('2020'), '2020');
  assert.equal(periodYear('2024-11..2025-10'), '2025');
  assert.equal(periodYear('2020'), '2020');
});
