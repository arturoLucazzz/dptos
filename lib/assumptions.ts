/**
 * The single row of assumptions, as plain numbers.
 *
 * Converting Prisma `Decimal` values to numbers: Decimal is right for storage, but
 * these values cross into the browser and get multiplied by each other on every
 * slider move, so they arrive as numbers.
 */

import { prisma } from './db';
import {
  DEFAULT_ASSUMPTIONS,
  fixedFromDefaults,
  type FixedAssumptions,
} from './assumption-defaults';
import type { CostAssumptions } from './costs';

export { DEFAULT_ASSUMPTIONS } from './assumption-defaults';
export type { FixedAssumptions } from './assumption-defaults';

export interface Assumptions extends CostAssumptions {
  usdPen: number;
  downPaymentPct: number;
  tea: number;
  tcea: number;
  termYears: number;
  vacancyMonthsPerYear: number;
  rentGrowthPct: number;
  rentIncomeTaxPct: number;
  bankMinDownPaymentPct: number;
  updatedAt: Date | null;
}

/** Anything Decimal-like, to a number. */
function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function fromDefaults(): Assumptions {
  return {
    ...DEFAULT_ASSUMPTIONS,
    arbitriosByDistrict: { ...DEFAULT_ASSUMPTIONS.arbitriosByDistrict },
    updatedAt: null,
  };
}

/**
 * Read the assumptions, falling back to the defaults when the row is missing.
 *
 * The fallback is not laziness: it means the app works on a fresh database, and it
 * means the defaults live in code where they can be reviewed rather than only in a
 * row somebody edited once.
 */
export async function getAssumptions(): Promise<Assumptions> {
  const row = await prisma.assumptions.findUnique({ where: { id: 'default' } });
  if (!row) return fromDefaults();

  const arbitrios = row.arbitriosByDistrict;
  return {
    uit: num(row.uit),
    usdPen: num(row.usdPen),
    downPaymentPct: num(row.downPaymentPct),
    tea: num(row.tea),
    tcea: num(row.tcea),
    termYears: row.termYears,
    vacancyMonthsPerYear: num(row.vacancyMonthsPerYear),
    rentGrowthPct: num(row.rentGrowthPct),
    rentIncomeTaxPct: num(row.rentIncomeTaxPct),
    bankMinDownPaymentPct: num(row.bankMinDownPaymentPct),
    defaultMaintenancePerM2: num(row.defaultMaintenancePerM2),
    alcabalaRatePct: num(row.alcabalaRatePct),
    alcabalaExemptUit: num(row.alcabalaExemptUit),
    alcabalaFirstSaleLandSharePct: num(row.alcabalaFirstSaleLandSharePct),
    notaryCost: num(row.notaryCost),
    registryPct: num(row.registryPct),
    appraisalCost: num(row.appraisalCost),
    titleStudyCost: num(row.titleStudyCost),
    assessedValueRatio: num(row.assessedValueRatio),
    arbitriosByDistrict:
      arbitrios && typeof arbitrios === 'object' && !Array.isArray(arbitrios)
        ? (arbitrios as Record<string, number>)
        : {},
    defaultArbitrios: num(row.defaultArbitrios),
    updatedAt: row.updatedAt,
  };
}

/** The cost/rent constants the client needs, without the panel-editable rates. */
export async function getFixedAssumptions(): Promise<FixedAssumptions> {
  const a = await getAssumptions();
  return fixedFromDefaults({
    uit: a.uit,
    alcabalaRatePct: a.alcabalaRatePct,
    alcabalaExemptUit: a.alcabalaExemptUit,
    alcabalaFirstSaleLandSharePct: a.alcabalaFirstSaleLandSharePct,
    notaryCost: a.notaryCost,
    registryPct: a.registryPct,
    appraisalCost: a.appraisalCost,
    titleStudyCost: a.titleStudyCost,
    assessedValueRatio: a.assessedValueRatio,
    arbitriosByDistrict: a.arbitriosByDistrict,
    defaultArbitrios: a.defaultArbitrios,
    defaultMaintenancePerM2: a.defaultMaintenancePerM2,
    vacancyMonthsPerYear: a.vacancyMonthsPerYear,
    rentGrowthPct: a.rentGrowthPct,
    rentIncomeTaxPct: a.rentIncomeTaxPct,
    bankMinDownPaymentPct: a.bankMinDownPaymentPct,
  });
}

/** Write the default row, leaving any existing edits untouched. */
export async function ensureAssumptions(): Promise<void> {
  await prisma.assumptions.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', ...DEFAULT_ASSUMPTIONS },
  });
}
