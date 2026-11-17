/**
 * What paying extra each month does to a mortgage.
 *
 * Peruvian banks must accept early payments without a penalty, and the borrower
 * picks between two effects. A shorter loan keeps the payment and ends sooner. A
 * lower payment keeps the end date and shrinks each instalment. The shorter loan
 * saves more interest, which is why it is shown first.
 *
 * Interest comes from the TEA, the rate that splits a payment into interest and
 * principal. The insurance inside the TCEA is not interest.
 */

import { effectiveMonthlyRate } from './finance';

export interface PrepaymentSavings {
  shorterLoan: { monthsSaved: number; interestSavedPen: number };
  lowerPayment: { paymentAfterOneYearPen: number; interestSavedPen: number };
}

interface Run {
  months: number;
  interestPen: number;
  paymentAfterOneYearPen: number;
}

function simulate(input: {
  loanPen: number;
  rate: number;
  months: number;
  extraMonthlyPen: number;
  recompute: boolean;
}): Run {
  const { rate, months, extraMonthlyPen, recompute } = input;
  const level = (balance: number, remaining: number) =>
    rate === 0 ? balance / remaining : (balance * rate) / (1 - (1 + rate) ** -remaining);

  let balance = input.loanPen;
  let payment = level(balance, months);
  let interestPen = 0;
  let paymentAfterOneYearPen = payment;
  let month = 0;

  while (balance > 0.005 && month < months) {
    const interest = balance * rate;
    interestPen += interest;
    balance -= Math.min(payment - interest, balance);
    balance -= Math.min(extraMonthlyPen, balance);
    month++;
    if (recompute && balance > 0.005 && month < months) payment = level(balance, months - month);
    if (month === 12) paymentAfterOneYearPen = balance > 0.005 ? payment : 0;
  }

  return { months: month, interestPen, paymentAfterOneYearPen };
}

export function prepaymentSavings(input: {
  loanPen: number;
  teaPct: number;
  termYears: number;
  extraMonthlyPen: number;
}): PrepaymentSavings | null {
  const { loanPen, termYears, extraMonthlyPen } = input;
  const months = Math.round(termYears * 12);
  if (!(loanPen > 0) || !(extraMonthlyPen > 0) || months <= 0) return null;

  const rate = effectiveMonthlyRate(input.teaPct);
  const base = simulate({ loanPen, rate, months, extraMonthlyPen: 0, recompute: false });
  const shorter = simulate({ loanPen, rate, months, extraMonthlyPen, recompute: false });
  const lower = simulate({ loanPen, rate, months, extraMonthlyPen, recompute: true });

  return {
    shorterLoan: {
      monthsSaved: base.months - shorter.months,
      interestSavedPen: base.interestPen - shorter.interestPen,
    },
    lowerPayment: {
      paymentAfterOneYearPen: lower.paymentAfterOneYearPen,
      interestSavedPen: base.interestPen - lower.interestPen,
    },
  };
}
