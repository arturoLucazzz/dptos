import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PANEL } from './assumption-defaults';
import {
  assumptionsLabel,
  parseAssumptionsCookie,
  serializeAssumptions,
} from './assumptions-cookie';

test('a missing or broken cookie gives the defaults', () => {
  assert.deepEqual(parseAssumptionsCookie(undefined), DEFAULT_PANEL);
  assert.deepEqual(parseAssumptionsCookie('{not json'), DEFAULT_PANEL);
});

test('out-of-range and missing fields fall back one by one', () => {
  const a = parseAssumptionsCookie(JSON.stringify({ tea: 500, downPaymentPct: 20, termYears: 25.5 }));
  assert.equal(a.tea, DEFAULT_PANEL.tea);
  assert.equal(a.downPaymentPct, 20);
  assert.equal(a.termYears, DEFAULT_PANEL.termYears);
  assert.equal(a.tcea, DEFAULT_PANEL.tcea);
});

test('serialize and parse round-trip', () => {
  const a = { ...DEFAULT_PANEL, tea: 9.5, cashAvailablePen: 150000 };
  assert.deepEqual(parseAssumptionsCookie(serializeAssumptions(a)), a);
});

test('the pill label', () => {
  assert.equal(
    assumptionsLabel({ ...DEFAULT_PANEL, tea: 8.5, downPaymentPct: 20 }),
    'Supuestos: TEA 8.5% · inicial 20% · 20 años'
  );
});
