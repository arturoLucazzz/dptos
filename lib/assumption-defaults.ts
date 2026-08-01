/**
 * Assumption defaults that the browser can import.
 *
 * Kept free of Prisma (and of any other Node-only dependency) so the finance panel
 * can read them without dragging the database client into the client bundle.
 */

import type { CostAssumptions } from './costs';
import type { FinanceAssumptions } from './finance';

/**
 * Defaults, each one a claim that can be checked.
 *
 * `uit` is the value to confirm every January; it drives both alcabala and predial,
 * so a stale UIT quietly biases every entry cost.
 */
export const DEFAULT_ASSUMPTIONS = {
  /** 2025 value. Set by the government each year. */
  uit: 5_350,
  usdPen: 3.75,

  downPaymentPct: 10,
  /** Rate of the loan itself, which splits the payment into interest and principal. */
  tea: 8,
  /** Includes life and property insurance and fees, so it is the real outflow. */
  tcea: 9,
  termYears: 20,

  vacancyMonthsPerYear: 1,
  rentGrowthPct: 3,
  /** Peru's cedular rate on rental income, 5% of gross. */
  rentIncomeTaxPct: 5,
  defaultMaintenancePerM2: 4,

  alcabalaRatePct: 3,
  alcabalaExemptUit: 10,
  alcabalaFirstSaleLandSharePct: 50,
  notaryCost: 1_000,
  registryPct: 0.3,
  appraisalCost: 600,
  titleStudyCost: 400,

  /**
   * Assessed value as a share of market price. Peruvian autovalúo runs well below
   * market, and this fraction is the weakest link in the predial estimate, which is
   * why predial is always reported as an estimate.
   */
  assessedValueRatio: 0.5,
  /**
   * Monthly arbitrios by district, in soles. No programmatic source exists, so this
   * is filled in by hand from each municipality's ordinance; districts left out fall
   * back to `defaultArbitrios` and are marked estimated.
   */
  arbitriosByDistrict: {} as Record<string, number>,
  defaultArbitrios: 120,
} as const;

/** The four numbers the assumptions panel edits. */
export type PanelAssumptions = Pick<
  FinanceAssumptions,
  'downPaymentPct' | 'tea' | 'tcea' | 'termYears'
>;

export const DEFAULT_PANEL: PanelAssumptions = {
  downPaymentPct: DEFAULT_ASSUMPTIONS.downPaymentPct,
  tea: DEFAULT_ASSUMPTIONS.tea,
  tcea: DEFAULT_ASSUMPTIONS.tcea,
  termYears: DEFAULT_ASSUMPTIONS.termYears,
};

/** Cost + rental constants that do not change with the panel. */
export type FixedAssumptions = CostAssumptions &
  Pick<FinanceAssumptions, 'vacancyMonthsPerYear' | 'rentGrowthPct' | 'rentIncomeTaxPct'>;

export function fixedFromDefaults(
  over: Partial<FixedAssumptions> = {}
): FixedAssumptions {
  return {
    uit: DEFAULT_ASSUMPTIONS.uit,
    alcabalaRatePct: DEFAULT_ASSUMPTIONS.alcabalaRatePct,
    alcabalaExemptUit: DEFAULT_ASSUMPTIONS.alcabalaExemptUit,
    alcabalaFirstSaleLandSharePct: DEFAULT_ASSUMPTIONS.alcabalaFirstSaleLandSharePct,
    notaryCost: DEFAULT_ASSUMPTIONS.notaryCost,
    registryPct: DEFAULT_ASSUMPTIONS.registryPct,
    appraisalCost: DEFAULT_ASSUMPTIONS.appraisalCost,
    titleStudyCost: DEFAULT_ASSUMPTIONS.titleStudyCost,
    assessedValueRatio: DEFAULT_ASSUMPTIONS.assessedValueRatio,
    arbitriosByDistrict: { ...DEFAULT_ASSUMPTIONS.arbitriosByDistrict },
    defaultArbitrios: DEFAULT_ASSUMPTIONS.defaultArbitrios,
    defaultMaintenancePerM2: DEFAULT_ASSUMPTIONS.defaultMaintenancePerM2,
    vacancyMonthsPerYear: DEFAULT_ASSUMPTIONS.vacancyMonthsPerYear,
    rentGrowthPct: DEFAULT_ASSUMPTIONS.rentGrowthPct,
    rentIncomeTaxPct: DEFAULT_ASSUMPTIONS.rentIncomeTaxPct,
    ...over,
  };
}

export function financeFrom(
  panel: PanelAssumptions,
  fixed: Pick<FinanceAssumptions, 'vacancyMonthsPerYear' | 'rentGrowthPct' | 'rentIncomeTaxPct'>
): FinanceAssumptions {
  return {
    ...panel,
    vacancyMonthsPerYear: fixed.vacancyMonthsPerYear,
    rentGrowthPct: fixed.rentGrowthPct,
    rentIncomeTaxPct: fixed.rentIncomeTaxPct,
  };
}
