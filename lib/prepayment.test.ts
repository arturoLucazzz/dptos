import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepaymentLines, prepaymentSavings } from './prepayment';

describe('prepaymentSavings', () => {
  it('cuts the loan from 240 to 165 months and saves about S/ 102,160', () => {
    const s = prepaymentSavings({ loanPen: 300_000, teaPct: 8, termYears: 20, extraMonthlyPen: 500 })!;
    assert.equal(s.shorterLoan.monthsSaved, 75);
    assert.ok(Math.abs(s.shorterLoan.interestSavedPen - 102_160) < 1, `saved ${s.shorterLoan.interestSavedPen}`);
  });

  it('lowers the payment to about S/ 2,407.72 after one year', () => {
    const s = prepaymentSavings({ loanPen: 300_000, teaPct: 8, termYears: 20, extraMonthlyPen: 500 })!;
    assert.ok(Math.abs(s.lowerPayment.paymentAfterOneYearPen - 2_407.72) < 0.01, `payment ${s.lowerPayment.paymentAfterOneYearPen}`);
    assert.ok(Math.abs(s.lowerPayment.interestSavedPen - 54_191) < 1, `saved ${s.lowerPayment.interestSavedPen}`);
  });

  it('ends the loan in the first month when the extra exceeds the balance', () => {
    const s = prepaymentSavings({ loanPen: 1_000, teaPct: 8, termYears: 20, extraMonthlyPen: 5_000 })!;
    assert.equal(s.shorterLoan.monthsSaved, 239);
  });

  it('returns null without a loan or without an extra amount', () => {
    assert.equal(prepaymentSavings({ loanPen: 0, teaPct: 8, termYears: 20, extraMonthlyPen: 500 }), null);
    assert.equal(prepaymentSavings({ loanPen: 300_000, teaPct: 8, termYears: 20, extraMonthlyPen: 0 }), null);
  });
});

describe('prepaymentLines', () => {
  it('shows both results: the shorter loan and the lower payment', () => {
    const s = prepaymentSavings({ loanPen: 300_000, teaPct: 8, termYears: 20, extraMonthlyPen: 500 });
    const lines = prepaymentLines(s, 2_457.45)!;
    assert.equal(lines.shorterLoan, 'Terminas 6.3 años antes · ahorras S/ 102,160');
    assert.equal(lines.lowerPayment, 'O bajas tu cuota S/ 50/mes · ahorras S/ 54,191');
  });
  it('is null without savings', () => {
    assert.equal(prepaymentLines(null, 2_000), null);
  });
});
