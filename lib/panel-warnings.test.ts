import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PANEL } from './assumption-defaults';
import { panelWarnings } from './panel-warnings';

describe('panelWarnings', () => {
  it('is quiet for a consistent panel', () => {
    assert.deepEqual(panelWarnings({ ...DEFAULT_PANEL, downPaymentPct: 25 }), []);
  });

  it('flags TCEA below TEA', () => {
    const w = panelWarnings({ ...DEFAULT_PANEL, downPaymentPct: 25, tea: 10, tcea: 9 });
    assert.deepEqual(w.map((x) => x.kind), ['TCEA_BELOW_TEA']);
  });

  it('flags an inicial below the bank minimum', () => {
    const w = panelWarnings({ ...DEFAULT_PANEL, downPaymentPct: 5, cashAvailablePen: null }, 20);
    assert.deepEqual(w.map((x) => x.kind), ['DOWN_PAYMENT_BELOW_BANK_MINIMUM']);
  });

  it('uses the bank minimum it is given', () => {
    const p = { ...DEFAULT_PANEL, downPaymentPct: 25, cashAvailablePen: null };
    assert.equal(panelWarnings(p, 30).length, 1);
    assert.equal(panelWarnings(p, 20).length, 0);
  });
});
