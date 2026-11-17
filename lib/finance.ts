/**
 * The mortgage arithmetic, as pure functions.
 *
 * All of this runs in the browser. Coverage is not a stored column, because if it
 * were, dragging the down-payment slider would mean recomputing and re-querying
 * thousands of rows on every tick. It does not need to be: a payment is a closed
 * formula of about thirty operations, so a few thousand rows recalculate instantly
 * in a `useMemo`.
 *
 * TEA and TCEA both exist here and are deliberately not interchangeable. Using
 * either for everything is wrong in a specific way:
 *
 * - TEA is the rate of the loan itself. Its payment is what amortizes the debt, so
 *   it is the one that splits into interest and principal and builds equity.
 * - TCEA also contains life insurance, property insurance and fees. Its payment is
 *   the actual cash leaving the account, so it is the one the rent has to cover.
 *
 * Using TCEA for the equity split would credit insurance premiums as equity. Using
 * TEA for coverage would quietly understate what the apartment costs each month.
 */

/** Rates in Peru are quoted as effective annual, so this is the honest conversion. */
export function effectiveMonthlyRate(annualEffectivePct: number): number {
  if (!Number.isFinite(annualEffectivePct) || annualEffectivePct <= 0) return 0;
  return (1 + annualEffectivePct / 100) ** (1 / 12) - 1;
}

/**
 * Level monthly payment for a loan.
 *
 * The zero-rate branch is not just defensive: an interest-free loan is a real thing
 * in a sensitivity table, and the standard formula divides by zero there.
 */
export function monthlyPayment(input: {
  principalPen: number;
  annualEffectivePct: number;
  termYears: number;
}): number {
  const { principalPen, termYears } = input;
  if (!(principalPen > 0) || !(termYears > 0)) return 0;

  const months = Math.round(termYears * 12);
  const rate = effectiveMonthlyRate(input.annualEffectivePct);
  if (rate === 0) return principalPen / months;

  return (principalPen * rate) / (1 - (1 + rate) ** -months);
}

export interface FinanceAssumptions {
  downPaymentPct: number;
  /** Rate of the loan itself, for the interest and principal split. */
  tea: number;
  /** Includes insurance and fees, so it is the real monthly outflow. */
  tcea: number;
  termYears: number;
  vacancyMonthsPerYear: number;
  rentGrowthPct: number;
  rentIncomeTaxPct: number;
  /** Cash the investor has. When set, it pays the purchase costs, then the down payment. */
  cashAvailablePen: number | null;
  /** Lowest down payment, as % of price, that banks usually accept. */
  bankMinDownPaymentPct: number;
}

export interface Loan {
  downPaymentPen: number;
  /** Down payment as a share of the price. */
  downPaymentPct: number;
  /** Cash mode only: the cash does not even cover the purchase costs. */
  outOfReach: boolean;
  loanPen: number;
  /** Real cash out each month, from the TCEA. */
  paymentPen: number;
  /** Payment that actually amortizes the debt, from the TEA. */
  amortizingPaymentPen: number;
}

export function loanFor(input: {
  pricePen: number;
  assumptions: FinanceAssumptions;
  /** One-off costs the cash pays first, in cash mode. */
  purchaseCostsPen?: number;
}): Loan {
  const { pricePen, assumptions: a } = input;
  const price = Math.max(0, pricePen);
  let downPaymentPen: number;
  let outOfReach = false;

  if (a.cashAvailablePen != null) {
    const costs = Math.max(0, input.purchaseCostsPen ?? 0);
    const cash = Math.max(0, a.cashAvailablePen);
    outOfReach = cash < costs;
    downPaymentPen = Math.min(price, Math.max(0, cash - costs));
  } else {
    downPaymentPen = price * (Math.min(Math.max(a.downPaymentPct, 0), 100) / 100);
  }
  const loanPen = price - downPaymentPen;

  return {
    downPaymentPen,
    downPaymentPct: price > 0 ? (downPaymentPen / price) * 100 : 0,
    outOfReach,
    loanPen,
    paymentPen: monthlyPayment({
      principalPen: loanPen,
      annualEffectivePct: a.tcea,
      termYears: a.termYears,
    }),
    amortizingPaymentPen: monthlyPayment({
      principalPen: loanPen,
      annualEffectivePct: a.tea,
      termYears: a.termYears,
    }),
  };
}

/**
 * Rent left over after the things that reduce it, per month.
 *
 * The gross figure is an estimate from district medians, and every deduction is
 * applied here rather than server-side so that making vacancy adjustable later
 * requires no reprocessing.
 *
 * Vacancy is applied as months lost per year, tax on the collected rent, and the
 * ownership costs subtracted last.
 */
export function netMonthlyRent(input: {
  grossRentPen: number;
  monthlyCostsPen: number;
  assumptions: FinanceAssumptions;
}): number {
  const { assumptions: a } = input;
  if (!Number.isFinite(input.grossRentPen) || input.grossRentPen <= 0) {
    return -Math.max(0, input.monthlyCostsPen);
  }

  const occupiedMonths = Math.max(0, 12 - Math.max(0, a.vacancyMonthsPerYear));
  const collectedPerMonth = (input.grossRentPen * occupiedMonths) / 12;
  const afterTax = collectedPerMonth * (1 - Math.max(0, a.rentIncomeTaxPct) / 100);
  return afterTax - Math.max(0, input.monthlyCostsPen);
}

export interface Coverage {
  /** Share of the monthly payment the net rent covers. */
  coveragePct: number;
  /** Payment minus net rent: what comes out of your pocket each month. */
  monthlyContributionPen: number;
}

/**
 * How much of the payment the rent covers, and what is left to pay yourself.
 *
 * With no loan there is no payment to cover, and reporting infinite coverage would
 * put those rows at the top of a ranking sorted by it, so coverage is 100% and the
 * contribution is whatever the costs exceed the rent by.
 */
export function coverage(input: {
  netRentPen: number;
  paymentPen: number;
}): Coverage {
  const { netRentPen, paymentPen } = input;
  if (paymentPen <= 0) {
    return {
      coveragePct: 100,
      monthlyContributionPen: Math.max(0, -netRentPen),
    };
  }
  return {
    coveragePct: (netRentPen / paymentPen) * 100,
    monthlyContributionPen: paymentPen - netRentPen,
  };
}

/** Annual rent over price, which is what "yield" means. */
export function yieldPct(input: {
  monthlyRentPen: number;
  pricePen: number;
}): number {
  if (!(input.pricePen > 0)) return 0;
  return ((input.monthlyRentPen * 12) / input.pricePen) * 100;
}

/**
 * The down payment at which the rent would exactly cover the payment.
 *
 * Solved rather than searched. The payment is proportional to the loan, so the loan
 * that a given rent can service is a division, and the down payment is what is left
 * of the price. This is the most honest column in the table: it says how far the
 * apartment is from the goal in the units of the thing you control.
 *
 * Null when no down payment achieves it, which happens when the ownership costs
 * alone already exceed the rent. Paying cash would not fix that.
 */
export function downPaymentPctForCoverage(input: {
  pricePen: number;
  netRentPen: number;
  assumptions: FinanceAssumptions;
  targetCoveragePct?: number;
}): number | null {
  const { pricePen, netRentPen, assumptions: a } = input;
  if (!(pricePen > 0)) return null;
  if (netRentPen <= 0) return null;

  const target = (input.targetCoveragePct ?? 100) / 100;
  // Payment per sol of loan, which is what makes this a division.
  const paymentPerSol = monthlyPayment({
    principalPen: 1,
    annualEffectivePct: a.tcea,
    termYears: a.termYears,
  });
  if (paymentPerSol <= 0) return 0;

  const affordableLoan = netRentPen / (target * paymentPerSol);
  const pct = ((pricePen - affordableLoan) / pricePen) * 100;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Year in which rent growth brings coverage to the target.
 *
 * The payment is fixed in nominal soles for the whole term while the rent is not,
 * which is the real argument for a fixed-rate mortgage. Rent and ownership costs are
 * grown at the same rate, so net rent grows at that rate too, and the crossover is a
 * logarithm rather than a simulation.
 *
 * Null when it never happens, or happens after the loan is already paid off — where
 * the answer would be arithmetically true and practically meaningless.
 */
export function crossoverYear(input: {
  netRentPen: number;
  paymentPen: number;
  assumptions: FinanceAssumptions;
  targetCoveragePct?: number;
}): number | null {
  const { netRentPen, paymentPen, assumptions: a } = input;
  const target = (input.targetCoveragePct ?? 100) / 100;

  if (paymentPen <= 0) return 0;
  if (netRentPen <= 0) return null;
  if (netRentPen >= target * paymentPen) return 0;

  const growth = a.rentGrowthPct / 100;
  if (growth <= 0) return null;

  const years = Math.log((target * paymentPen) / netRentPen) / Math.log(1 + growth);
  const whole = Math.ceil(years);
  return whole > a.termYears ? null : whole;
}

/**
 * What the investor adds from their own pocket until rent overtakes the payment.
 *
 * Year by year, with net rent growing at the rent growth rate and the payment fixed,
 * the same model as `crossoverYear`. Never past the end of the loan.
 */
export function totalAddedUntilCrossover(input: {
  netRentPen: number;
  paymentPen: number;
  assumptions: FinanceAssumptions;
}): number {
  const { netRentPen, paymentPen, assumptions: a } = input;
  const growth = 1 + Math.max(0, a.rentGrowthPct) / 100;
  let total = 0;
  for (let year = 1; year <= a.termYears; year++) {
    const net = netRentPen * growth ** (year - 1);
    if (net >= paymentPen) break;
    total += 12 * (paymentPen - net);
  }
  return total;
}

export interface AmortizationYear {
  year: number;
  interestPen: number;
  principalPen: number;
  /** Debt remaining at the end of the year. */
  balancePen: number;
  /** Down payment plus principal repaid. Insurance premiums are not equity. */
  equityPen: number;
}

/**
 * Year-by-year interest, principal and equity, from the TEA.
 *
 * Uses the amortizing payment on purpose: the TCEA payment is larger because of
 * insurance, and counting that difference as equity would overstate what the
 * payments are building.
 */
export function amortizationByYear(input: {
  pricePen: number;
  assumptions: FinanceAssumptions;
}): AmortizationYear[] {
  const loan = loanFor(input);
  const a = input.assumptions;
  const months = Math.round(a.termYears * 12);
  if (months <= 0) return [];

  const rate = effectiveMonthlyRate(a.tea);
  const payment = loan.amortizingPaymentPen;

  const years: AmortizationYear[] = [];
  let balance = loan.loanPen;

  for (let year = 1; year <= a.termYears; year++) {
    let interestPen = 0;
    let principalPen = 0;

    for (let month = 0; month < 12 && (year - 1) * 12 + month < months; month++) {
      const interest = balance * rate;
      // The last payment is whatever is left, not a full instalment.
      const principal = Math.min(payment - interest, balance);
      interestPen += interest;
      principalPen += principal;
      balance -= principal;
    }

    years.push({
      year,
      interestPen,
      principalPen,
      balancePen: Math.max(0, balance),
      equityPen: loan.downPaymentPen + (loan.loanPen - Math.max(0, balance)),
    });
  }

  return years;
}

export interface SensitivityCell {
  downPaymentPct: number;
  termYears: number;
  coveragePct: number;
  monthlyContributionPen: number;
}

/**
 * Coverage across down payments and terms.
 *
 * The point of showing the grid is to reveal which assumption the decision actually
 * depends on: some apartments are rescued by a longer term, others only by more cash
 * up front, and the two look identical in a single-number view.
 */
export function sensitivity(input: {
  pricePen: number;
  grossRentPen: number;
  monthlyCostsPen: number;
  assumptions: FinanceAssumptions;
  downPaymentPcts?: number[];
  termYearsOptions?: number[];
}): SensitivityCell[] {
  const downPaymentPcts = input.downPaymentPcts ?? [10, 20, 30, 50];
  const termYearsOptions = input.termYearsOptions ?? [15, 20, 25];

  const cells: SensitivityCell[] = [];
  for (const downPaymentPct of downPaymentPcts) {
    for (const termYears of termYearsOptions) {
      const assumptions = { ...input.assumptions, downPaymentPct, termYears };
      const loan = loanFor({ pricePen: input.pricePen, assumptions });
      const netRentPen = netMonthlyRent({
        grossRentPen: input.grossRentPen,
        monthlyCostsPen: input.monthlyCostsPen,
        assumptions,
      });
      const { coveragePct, monthlyContributionPen } = coverage({
        netRentPen,
        paymentPen: loan.paymentPen,
      });
      cells.push({ downPaymentPct, termYears, coveragePct, monthlyContributionPen });
    }
  }
  return cells;
}

export type AssumptionWarning =
  | { kind: 'TCEA_BELOW_TEA'; message: string }
  | { kind: 'DOWN_PAYMENT_BELOW_BANK_MINIMUM'; message: string };

/**
 * Inconsistent or optimistic assumptions, for the UI to show next to the controls.
 *
 * Both of these are easy to create by accident and neither produces an error — they
 * just make every number on the page quietly wrong in the flattering direction.
 */
export function assumptionWarnings(a: FinanceAssumptions): AssumptionWarning[] {
  const warnings: AssumptionWarning[] = [];

  if (a.tcea < a.tea) {
    warnings.push({
      kind: 'TCEA_BELOW_TEA',
      message:
        'La TCEA está por debajo de la TEA. La TCEA incluye seguros y comisiones, así que no puede ser menor.',
    });
  }

  if (a.cashAvailablePen == null && a.downPaymentPct < a.bankMinDownPaymentPct) {
    warnings.push({
      kind: 'DOWN_PAYMENT_BELOW_BANK_MINIMUM',
      message: `La inicial está por debajo del mínimo que suelen pedir los bancos (${a.bankMinDownPaymentPct}%).`,
    });
  }

  return warnings;
}

export interface ListingFinance extends Coverage {
  loan: Loan;
  netRentPen: number;
  grossYieldPct: number;
  netYieldPct: number;
  downPaymentPctForFullCoverage: number | null;
  crossoverYear: number | null;
  /** Down payment plus the one-off purchase costs: the cash on day one. */
  entryCostPen: number;
  /** Net rent minus the real monthly payment. Negative means the investor adds money. */
  monthlyGainPen: number;
  /** Yearly gain over the cash on day one. Null when there is no gain to show. */
  yearlyGainPctOnCash: number | null;
  totalAddedUntilCrossoverPen: number;
  /** Cash mode: the down payment the cash leaves is below what banks usually accept. */
  belowBankMinimum: boolean;
}

/** Everything the table shows for one listing, in one pass. */
export function listingFinance(input: {
  pricePen: number;
  grossRentPen: number;
  monthlyCostsPen: number;
  purchaseCostsPen: number;
  assumptions: FinanceAssumptions;
}): ListingFinance {
  const loan = loanFor({
    pricePen: input.pricePen,
    assumptions: input.assumptions,
    purchaseCostsPen: input.purchaseCostsPen,
  });
  const netRentPen = netMonthlyRent({
    grossRentPen: input.grossRentPen,
    monthlyCostsPen: input.monthlyCostsPen,
    assumptions: input.assumptions,
  });
  const { coveragePct, monthlyContributionPen } = coverage({
    netRentPen,
    paymentPen: loan.paymentPen,
  });
  const entryCostPen = loan.downPaymentPen + Math.max(0, input.purchaseCostsPen);
  const monthlyGainPen = netRentPen - loan.paymentPen;

  return {
    loan,
    netRentPen,
    coveragePct,
    monthlyContributionPen,
    grossYieldPct: yieldPct({ monthlyRentPen: input.grossRentPen, pricePen: input.pricePen }),
    netYieldPct: yieldPct({ monthlyRentPen: netRentPen, pricePen: input.pricePen }),
    downPaymentPctForFullCoverage: downPaymentPctForCoverage({
      pricePen: input.pricePen,
      netRentPen,
      assumptions: input.assumptions,
    }),
    crossoverYear: crossoverYear({
      netRentPen,
      paymentPen: loan.paymentPen,
      assumptions: input.assumptions,
    }),
    entryCostPen,
    monthlyGainPen,
    yearlyGainPctOnCash:
      monthlyGainPen > 0 && entryCostPen > 0 ? ((monthlyGainPen * 12) / entryCostPen) * 100 : null,
    totalAddedUntilCrossoverPen: totalAddedUntilCrossover({
      netRentPen,
      paymentPen: loan.paymentPen,
      assumptions: input.assumptions,
    }),
    belowBankMinimum:
      input.assumptions.cashAvailablePen != null &&
      loan.loanPen > 0 &&
      loan.downPaymentPct < input.assumptions.bankMinDownPaymentPct,
  };
}
