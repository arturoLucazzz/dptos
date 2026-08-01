/**
 * The golden test is the plan's worked example: S/ 400,000 at 10% down, TCEA 9%,
 * 20 years gives a payment of S/ 3,158, and stretching the term to 30 years gives
 * S/ 2,806. Both numbers were computed independently of this code, so if someone
 * changes the rate convention — nominal divided by twelve instead of effective
 * annual, say — these fail instead of a dashboard being silently wrong.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  amortizationByYear,
  assumptionWarnings,
  coverage,
  crossoverYear,
  downPaymentPctForCoverage,
  effectiveMonthlyRate,
  listingFinance,
  loanFor,
  monthlyPayment,
  netMonthlyRent,
  sensitivity,
  yieldPct,
  type FinanceAssumptions,
} from './finance';

const BASE: FinanceAssumptions = {
  downPaymentPct: 10,
  tea: 8,
  tcea: 9,
  termYears: 20,
  vacancyMonthsPerYear: 1,
  rentGrowthPct: 3,
  rentIncomeTaxPct: 5,
};

describe('the worked example', () => {
  it('gives a payment of S/ 3,158 on S/ 400,000 at 10% down, TCEA 9%, 20 years', () => {
    const loan = loanFor({ pricePen: 400_000, assumptions: BASE });
    assert.equal(loan.downPaymentPen, 40_000);
    assert.equal(loan.loanPen, 360_000);
    assert.ok(Math.abs(loan.paymentPen - 3_158) < 1, `payment was ${loan.paymentPen.toFixed(2)}`);
  });

  it('gives S/ 2,806 when the term goes to 30 years', () => {
    const loan = loanFor({ pricePen: 400_000, assumptions: { ...BASE, termYears: 30 } });
    assert.ok(Math.abs(loan.paymentPen - 2_806) < 1, `payment was ${loan.paymentPen.toFixed(2)}`);
  });

  it('moves coverage from 40% to 45% with that longer term, as the plan says', () => {
    // The plan's illustration: net rent that covers 40% at 20 years covers 45% at 30.
    const at20 = loanFor({ pricePen: 400_000, assumptions: BASE }).paymentPen;
    const netRentPen = 0.4 * at20;
    const at30 = loanFor({ pricePen: 400_000, assumptions: { ...BASE, termYears: 30 } }).paymentPen;

    assert.ok(Math.abs(coverage({ netRentPen, paymentPen: at20 }).coveragePct - 40) < 0.1);
    assert.ok(Math.abs(coverage({ netRentPen, paymentPen: at30 }).coveragePct - 45) < 0.5);
  });

  it('treats the rate as effective annual, not nominal over twelve', () => {
    // The wrong convention would give 0.0075 and a payment near S/ 3,239.
    assert.ok(Math.abs(effectiveMonthlyRate(9) - 0.0072073) < 1e-6);
    const nominal = monthlyPayment({ principalPen: 360_000, annualEffectivePct: 9, termYears: 20 });
    assert.ok(Math.abs(nominal - 3_158) < 1, `payment was ${nominal.toFixed(2)}`);
  });
});

describe('monthlyPayment', () => {
  it('is zero without a loan or a term', () => {
    assert.equal(monthlyPayment({ principalPen: 0, annualEffectivePct: 9, termYears: 20 }), 0);
    assert.equal(monthlyPayment({ principalPen: 100_000, annualEffectivePct: 9, termYears: 0 }), 0);
  });

  it('divides evenly at a zero rate instead of dividing by zero', () => {
    const payment = monthlyPayment({ principalPen: 240_000, annualEffectivePct: 0, termYears: 20 });
    assert.equal(payment, 1_000);
  });

  it('rises with the rate and falls with the term', () => {
    const base = monthlyPayment({ principalPen: 360_000, annualEffectivePct: 9, termYears: 20 });
    assert.ok(monthlyPayment({ principalPen: 360_000, annualEffectivePct: 12, termYears: 20 }) > base);
    assert.ok(monthlyPayment({ principalPen: 360_000, annualEffectivePct: 9, termYears: 25 }) < base);
  });

  it('repays the loan exactly over the term', () => {
    const schedule = amortizationByYear({ pricePen: 400_000, assumptions: BASE });
    assert.equal(schedule.length, 20);
    assert.ok(schedule[19].balancePen < 1, `balance left was ${schedule[19].balancePen}`);
    assert.ok(Math.abs(schedule[19].equityPen - 400_000) < 1);
  });
});

describe('TEA and TCEA have separate jobs', () => {
  it('charges more per month under TCEA than under TEA', () => {
    const loan = loanFor({ pricePen: 400_000, assumptions: BASE });
    assert.ok(loan.paymentPen > loan.amortizingPaymentPen);
  });

  it('builds equity from the TEA payment, so insurance is not counted as equity', () => {
    const schedule = amortizationByYear({ pricePen: 400_000, assumptions: BASE });
    const loan = loanFor({ pricePen: 400_000, assumptions: BASE });
    // A year of TCEA payments exceeds a year of TEA payments; the difference is
    // insurance and must not appear in equity.
    const paidUnderTcea = loan.paymentPen * 12;
    assert.ok(schedule[0].interestPen + schedule[0].principalPen < paidUnderTcea);
    assert.ok(schedule[0].equityPen < loan.downPaymentPen + paidUnderTcea);
  });

  it('front-loads interest, as an amortizing loan does', () => {
    const schedule = amortizationByYear({ pricePen: 400_000, assumptions: BASE });
    assert.ok(schedule[0].interestPen > schedule[0].principalPen);
    assert.ok(schedule[19].principalPen > schedule[19].interestPen);
  });
});

describe('netMonthlyRent', () => {
  it('applies vacancy, then tax, then the ownership costs', () => {
    // 2,000 gross, one month vacant => 1,833.33; less 5% tax => 1,741.67; less 400.
    const net = netMonthlyRent({ grossRentPen: 2_000, monthlyCostsPen: 400, assumptions: BASE });
    assert.ok(Math.abs(net - 1_341.67) < 0.5, `net rent was ${net.toFixed(2)}`);
  });

  it('goes negative when the costs exceed the rent, rather than clamping', () => {
    const net = netMonthlyRent({ grossRentPen: 500, monthlyCostsPen: 900, assumptions: BASE });
    assert.ok(net < 0, `net rent was ${net}`);
  });

  it('is the negative of the costs when there is no rent at all', () => {
    assert.equal(netMonthlyRent({ grossRentPen: 0, monthlyCostsPen: 400, assumptions: BASE }), -400);
  });

  it('loses the whole rent at twelve months of vacancy', () => {
    const net = netMonthlyRent({
      grossRentPen: 2_000,
      monthlyCostsPen: 0,
      assumptions: { ...BASE, vacancyMonthsPerYear: 12 },
    });
    assert.equal(net, 0);
  });
});

describe('coverage', () => {
  it('is the share of the payment the rent covers', () => {
    const result = coverage({ netRentPen: 1_579, paymentPen: 3_158 });
    assert.ok(Math.abs(result.coveragePct - 50) < 0.01);
    assert.ok(Math.abs(result.monthlyContributionPen - 1_579) < 0.01);
  });

  it('does not report infinite coverage on an all-cash purchase', () => {
    // Otherwise these rows sort to the top of a ranking by coverage.
    const result = coverage({ netRentPen: 1_500, paymentPen: 0 });
    assert.equal(result.coveragePct, 100);
    assert.equal(result.monthlyContributionPen, 0);
  });

  it('reports the shortfall when a paid-off apartment still loses money', () => {
    const result = coverage({ netRentPen: -300, paymentPen: 0 });
    assert.equal(result.monthlyContributionPen, 300);
  });
});

describe('downPaymentPctForCoverage', () => {
  it('finds the down payment that makes the rent exactly cover the payment', () => {
    const netRentPen = 1_800;
    const pct = downPaymentPctForCoverage({ pricePen: 400_000, netRentPen, assumptions: BASE });
    assert.ok(pct != null);

    // Verify by substituting it back: coverage should land on 100%.
    const loan = loanFor({ pricePen: 400_000, assumptions: { ...BASE, downPaymentPct: pct } });
    const check = coverage({ netRentPen, paymentPen: loan.paymentPen });
    assert.ok(Math.abs(check.coveragePct - 100) < 0.01, `coverage came out at ${check.coveragePct}`);
  });

  it('asks for nothing when the rent already covers the whole price', () => {
    assert.equal(
      downPaymentPctForCoverage({ pricePen: 100_000, netRentPen: 50_000, assumptions: BASE }),
      0
    );
  });

  it('gives up when the costs alone exceed the rent, because cash cannot fix that', () => {
    assert.equal(
      downPaymentPctForCoverage({ pricePen: 400_000, netRentPen: -100, assumptions: BASE }),
      null
    );
  });

  it('needs a bigger down payment for a worse rent', () => {
    const poor = downPaymentPctForCoverage({ pricePen: 400_000, netRentPen: 1_200, assumptions: BASE })!;
    const better = downPaymentPctForCoverage({ pricePen: 400_000, netRentPen: 2_400, assumptions: BASE })!;
    assert.ok(poor > better);
  });
});

describe('crossoverYear', () => {
  it('finds the year rent growth closes the gap', () => {
    // 2,000 against 3,158 needs 1.579x, which at 3% a year takes 16 years.
    const year = crossoverYear({ netRentPen: 2_000, paymentPen: 3_158, assumptions: BASE });
    assert.equal(year, 16);
  });

  it('is zero when the rent already covers the payment', () => {
    assert.equal(crossoverYear({ netRentPen: 3_500, paymentPen: 3_158, assumptions: BASE }), 0);
  });

  it('returns null rather than a year beyond the loan term', () => {
    // A gap this wide would close long after the mortgage is paid off.
    assert.equal(crossoverYear({ netRentPen: 500, paymentPen: 3_158, assumptions: BASE }), null);
  });

  it('never crosses without rent growth', () => {
    assert.equal(
      crossoverYear({ netRentPen: 2_000, paymentPen: 3_158, assumptions: { ...BASE, rentGrowthPct: 0 } }),
      null
    );
  });

  it('crosses sooner with faster rent growth', () => {
    const slow = crossoverYear({ netRentPen: 2_000, paymentPen: 3_158, assumptions: BASE })!;
    const fast = crossoverYear({
      netRentPen: 2_000,
      paymentPen: 3_158,
      assumptions: { ...BASE, rentGrowthPct: 8 },
    })!;
    assert.ok(fast < slow);
  });
});

describe('yieldPct', () => {
  it('is annual rent over price', () => {
    assert.ok(Math.abs(yieldPct({ monthlyRentPen: 2_000, pricePen: 400_000 }) - 6) < 1e-9);
    assert.equal(yieldPct({ monthlyRentPen: 2_000, pricePen: 0 }), 0);
  });
});

describe('sensitivity', () => {
  it('covers every combination of down payment and term', () => {
    const cells = sensitivity({
      pricePen: 400_000,
      grossRentPen: 2_000,
      monthlyCostsPen: 400,
      assumptions: BASE,
    });
    assert.equal(cells.length, 12);
  });

  it('improves coverage with more cash down and with a longer term', () => {
    const cells = sensitivity({
      pricePen: 400_000,
      grossRentPen: 2_000,
      monthlyCostsPen: 400,
      assumptions: BASE,
    });
    const at = (down: number, term: number) =>
      cells.find((c) => c.downPaymentPct === down && c.termYears === term)!.coveragePct;

    assert.ok(at(50, 20) > at(10, 20));
    assert.ok(at(10, 25) > at(10, 15));
  });

  it('does not let the panel assumptions leak into the grid', () => {
    const cells = sensitivity({
      pricePen: 400_000,
      grossRentPen: 2_000,
      monthlyCostsPen: 400,
      assumptions: { ...BASE, downPaymentPct: 90, termYears: 5 },
      downPaymentPcts: [10],
      termYearsOptions: [20],
    });
    assert.equal(cells.length, 1);
    const loan = loanFor({ pricePen: 400_000, assumptions: BASE });
    const expected = coverage({
      netRentPen: netMonthlyRent({ grossRentPen: 2_000, monthlyCostsPen: 400, assumptions: BASE }),
      paymentPen: loan.paymentPen,
    });
    assert.ok(Math.abs(cells[0].coveragePct - expected.coveragePct) < 1e-9);
  });
});

describe('assumptionWarnings', () => {
  it('says nothing about a consistent, conservative scenario', () => {
    assert.deepEqual(assumptionWarnings({ ...BASE, downPaymentPct: 25 }), []);
  });

  it('catches TCEA below TEA, which is silently impossible', () => {
    const warnings = assumptionWarnings({ ...BASE, tea: 10, tcea: 9, downPaymentPct: 25 });
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].kind, 'TCEA_BELOW_TEA');
  });

  it('warns about a down payment below what banks ask for', () => {
    const warnings = assumptionWarnings(BASE);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].kind, 'DOWN_PAYMENT_BELOW_BANK_MINIMUM');
  });
});

describe('listingFinance', () => {
  it('assembles the columns the table shows', () => {
    const result = listingFinance({
      pricePen: 400_000,
      grossRentPen: 2_000,
      monthlyCostsPen: 400,
      purchaseCostsPen: 13_595,
      assumptions: BASE,
    });

    assert.ok(Math.abs(result.loan.paymentPen - 3_158) < 1);
    assert.ok(Math.abs(result.netRentPen - 1_341.67) < 0.5);
    assert.ok(Math.abs(result.coveragePct - 42.5) < 0.5, `coverage was ${result.coveragePct}`);
    assert.ok(Math.abs(result.monthlyContributionPen - 1_816) < 2);
    assert.ok(Math.abs(result.grossYieldPct - 6) < 1e-9);
    assert.ok(result.netYieldPct < result.grossYieldPct);
    assert.ok(result.downPaymentPctForFullCoverage! > 50);
    assert.equal(result.entryCostPen, 40_000 + 13_595);
  });

  it('stays coherent on an all-cash purchase', () => {
    const result = listingFinance({
      pricePen: 400_000,
      grossRentPen: 2_000,
      monthlyCostsPen: 400,
      purchaseCostsPen: 13_595,
      assumptions: { ...BASE, downPaymentPct: 100 },
    });
    assert.equal(result.loan.loanPen, 0);
    assert.equal(result.loan.paymentPen, 0);
    assert.equal(result.coveragePct, 100);
    assert.equal(result.crossoverYear, 0);
    assert.equal(result.entryCostPen, 400_000 + 13_595);
  });
});
