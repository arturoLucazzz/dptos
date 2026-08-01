/**
 * What buying and holding an apartment actually costs, beyond the asking price.
 *
 * Pure functions over plain numbers, with no database access, because these run in
 * the browser every time an assumption slider moves. Everything they need arrives
 * as an argument, including the tax constants, so nothing here goes stale when the
 * UIT changes.
 *
 * The one counter-intuitive result: the *used* apartment carries the higher entry
 * cost, not the new one. A developer's first sale is exempt from alcabala except for
 * the land portion, so buying second-hand costs about 2.6 points more up front on a
 * S/ 400,000 flat. That is large enough to change which listing is the better deal.
 */

/** Constants the cost functions need, all editable and none derived. */
export interface CostAssumptions {
  uit: number;
  alcabalaRatePct: number;
  alcabalaExemptUit: number;
  alcabalaFirstSaleLandSharePct: number;
  notaryCost: number;
  registryPct: number;
  appraisalCost: number;
  titleStudyCost: number;
  assessedValueRatio: number;
  arbitriosByDistrict: Record<string, number>;
  defaultArbitrios: number;
  defaultMaintenancePerM2: number;
}

/**
 * The legal minimum annual predial, 0.6% of a UIT.
 *
 * Included because it is the binding number for cheap apartments: without it the
 * formula returns less than the law's floor.
 */
const MIN_PREDIAL_UIT_SHARE = 0.006;

/** Predial brackets, in UIT of assessed value, each rate applying to its own slice. */
const PREDIAL_BRACKETS = [
  { upToUit: 15, ratePct: 0.2 },
  { upToUit: 60, ratePct: 0.6 },
  { upToUit: Infinity, ratePct: 1.0 },
] as const;

export interface CostLine {
  label: string;
  amountPen: number;
  /**
   * True when the amount is a default rather than something observed or computed
   * from a formula, so the UI can show which parts of a total are guesses.
   */
  estimated: boolean;
}

/**
 * Alcabala: 3% of the transfer value, counting only the excess over 10 UIT.
 *
 * `isFirstSaleFromDeveloper` must mean exactly that — the first transfer of the
 * unit, made by whoever built it. It is not "the building is new" and not "antiquity
 * is zero": a two-year-old flat being resold by its first owner pays the full
 * alcabala even though nobody has lived in it.
 */
export function alcabala(input: {
  pricePen: number;
  isFirstSaleFromDeveloper: boolean;
  assumptions: CostAssumptions;
}): number {
  const { pricePen, assumptions: a } = input;
  if (!Number.isFinite(pricePen) || pricePen <= 0) return 0;

  const taxableValue = input.isFirstSaleFromDeveloper
    ? pricePen * (a.alcabalaFirstSaleLandSharePct / 100)
    : pricePen;

  const exempt = a.alcabalaExemptUit * a.uit;
  const base = Math.max(0, taxableValue - exempt);
  return base * (a.alcabalaRatePct / 100);
}

export interface PurchaseCosts {
  totalPen: number;
  /** Total as a share of the asking price, which is the comparable number. */
  pctOfPrice: number;
  lines: CostLine[];
}

/**
 * Everything paid once, at purchase, on top of the price.
 *
 * Excludes the broker's fee, which in Peru the seller normally pays, and excludes
 * life and property insurance, which are already inside the TCEA and would be
 * double-counted here.
 */
export function purchaseCosts(input: {
  pricePen: number;
  isFirstSaleFromDeveloper: boolean;
  assumptions: CostAssumptions;
}): PurchaseCosts {
  const { pricePen, assumptions: a } = input;

  const lines: CostLine[] = [
    {
      label: input.isFirstSaleFromDeveloper ? 'Alcabala (primera venta, solo terreno)' : 'Alcabala',
      amountPen: alcabala(input),
      estimated: input.isFirstSaleFromDeveloper,
    },
    { label: 'Notaría', amountPen: a.notaryCost, estimated: true },
    { label: 'Registro (SUNARP)', amountPen: pricePen * (a.registryPct / 100), estimated: false },
    { label: 'Tasación', amountPen: a.appraisalCost, estimated: true },
    { label: 'Estudio de títulos', amountPen: a.titleStudyCost, estimated: true },
  ];

  const totalPen = lines.reduce((sum, line) => sum + line.amountPen, 0);
  return {
    totalPen,
    pctOfPrice: pricePen > 0 ? (totalPen / pricePen) * 100 : 0,
    lines,
  };
}

/**
 * Annual predial from the assessed value, by brackets.
 *
 * Deterministic and cheap, so it is computed rather than guessed even though it
 * comes out small: about S/ 73 a month on a S/ 400,000 apartment. The assessed value
 * is the weak link — it is a fraction of the market price, and that fraction is an
 * assumption.
 */
export function annualPredial(input: { pricePen: number; assumptions: CostAssumptions }): number {
  const { assumptions: a } = input;
  const assessed = Math.max(0, input.pricePen) * a.assessedValueRatio;

  let tax = 0;
  let taxedSoFar = 0;
  for (const bracket of PREDIAL_BRACKETS) {
    const ceiling = bracket.upToUit === Infinity ? Infinity : bracket.upToUit * a.uit;
    const slice = Math.min(assessed, ceiling) - taxedSoFar;
    if (slice <= 0) continue;
    tax += slice * (bracket.ratePct / 100);
    taxedSoFar += slice;
    if (taxedSoFar >= assessed) break;
  }

  return Math.max(tax, MIN_PREDIAL_UIT_SHARE * a.uit);
}

/** Monthly arbitrios for a district, and whether the number is a fallback. */
export function monthlyArbitrios(input: {
  districtSlug: string;
  assumptions: CostAssumptions;
}): { amountPen: number; estimated: boolean } {
  const value = input.assumptions.arbitriosByDistrict[input.districtSlug];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return { amountPen: value, estimated: false };
  }
  return { amountPen: input.assumptions.defaultArbitrios, estimated: true };
}

/**
 * Monthly maintenance: what the listing published, else the district-wide rate.
 *
 * Published fees are per unit and already include the building's own arithmetic, so
 * they are always preferred over an area-based estimate.
 */
export function monthlyMaintenance(input: {
  publishedPen: number | null;
  areaM2: number | null;
  assumptions: CostAssumptions;
}): { amountPen: number; estimated: boolean } {
  if (input.publishedPen != null && Number.isFinite(input.publishedPen) && input.publishedPen > 0) {
    return { amountPen: input.publishedPen, estimated: false };
  }
  const area = input.areaM2 != null && input.areaM2 > 0 ? input.areaM2 : 0;
  return { amountPen: area * input.assumptions.defaultMaintenancePerM2, estimated: true };
}

export interface MonthlyCosts {
  totalPen: number;
  lines: CostLine[];
  /** True when any line is a default, so a total can be shown as approximate. */
  hasEstimates: boolean;
}

/**
 * Recurring monthly cost of owning the apartment, excluding the mortgage payment.
 *
 * These reduce how much of the payment the rent can cover, which is why they belong
 * next to the financing rather than in a footnote.
 */
export function monthlyCosts(input: {
  pricePen: number;
  areaM2: number | null;
  districtSlug: string;
  publishedMaintenancePen: number | null;
  assumptions: CostAssumptions;
}): MonthlyCosts {
  const maintenance = monthlyMaintenance({
    publishedPen: input.publishedMaintenancePen,
    areaM2: input.areaM2,
    assumptions: input.assumptions,
  });
  const arbitrios = monthlyArbitrios({
    districtSlug: input.districtSlug,
    assumptions: input.assumptions,
  });

  const lines: CostLine[] = [
    { label: 'Mantenimiento', amountPen: maintenance.amountPen, estimated: maintenance.estimated },
    {
      label: 'Predial',
      amountPen: annualPredial({ pricePen: input.pricePen, assumptions: input.assumptions }) / 12,
      // The formula is exact; the assessed value it runs on is not.
      estimated: true,
    },
    { label: 'Arbitrios', amountPen: arbitrios.amountPen, estimated: arbitrios.estimated },
  ];

  return {
    totalPen: lines.reduce((sum, line) => sum + line.amountPen, 0),
    lines,
    hasEstimates: lines.some((line) => line.estimated),
  };
}
