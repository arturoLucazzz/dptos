/**
 * Filter / finance / sort / paginate the sale listings universe for the
 * sale listings (Inicio and Mis inversiones). Runs on the server so the browser only holds one page.
 */

import { type FixedAssumptions, type PanelAssumptions } from './assumption-defaults';
import { financeForListing, loanForListing } from './listing-finance';
import type { SourceId } from './listing-card';
import type { ListingRow } from './listing-row';
import { grossYieldPct, pricePerM2 } from './gross-yield';
import { median } from './linalg';
import { pointInPolygon, type Ring } from './location/geo';
import { prepaymentLines, prepaymentSavings, type PrepaymentLines, type PrepaymentSavings } from './prepayment';

export const DEPARTAMENTOS_PAGE_SIZE = 50;

export const DEPARTAMENTOS_SORT_IDS = [
  'monthlyGain',
  'pricePen',
  'coverage',
  'aporte',
  'cuota',
  'descuento',
  'inicial100',
  'location',
  'grossYield',
  'cashReturn',
  'pricePerM2',
  'entryCost',
  'newest',
] as const;

export type DepartamentosSortId = (typeof DEPARTAMENTOS_SORT_IDS)[number];

export interface DepartamentosQueryInput {
  districts: string[];
  /** Keep rows with at least one copy from these sources. Empty means all. */
  sources: SourceId[];
  priceMin: number | null;
  priceMax: number | null;
  bedroomsMin: number | null;
  bedroomsMax: number | null;
  coverageMin: number | null;
  /** Keep rows with a location score at least this; rows with no score drop out. */
  locationMin?: number | null;
  /** Keep only rows with coordinates inside this polygon. Null or absent keeps all. */
  area?: Ring | null;
  /** Floor area range in m²; rows with no area drop out when either bound is set. */
  areaM2Min?: number | null;
  areaM2Max?: number | null;
  panel: PanelAssumptions;
  sort: DepartamentosSortId;
  order: 'asc' | 'desc';
  page: number;
  pageSize?: number;
}

export interface DepartamentosRow extends ListingRow {
  coveragePct: number | null;
  monthlyContributionPen: number | null;
  paymentPen: number | null;
  downPaymentPctForFullCoverage: number | null;
  /** Net rent minus the payment. Negative means the investor adds money each month. */
  monthlyGainPen: number | null;
  yearlyGainPctOnCash: number | null;
  /** Cash on day one: down payment plus purchase costs. */
  entryCostPen: number | null;
  totalAddedUntilCrossoverPen: number | null;
  belowBankMinimum: boolean;
  outOfReach: boolean;
  prepayment: PrepaymentSavings | null;
  /** Both early-payment results as table text. */
  prepaymentLines: PrepaymentLines | null;
}

export interface DepartamentosStats {
  total: number;
  withRent: number;
  coverageMedian: number | null;
  aporteMedian: number | null;
  above40: number;
  precioMediano: number | null;
}

export interface DepartamentosQueryResult {
  rows: DepartamentosRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: DepartamentosStats;
}

function sortValue(row: DepartamentosRow, sort: DepartamentosSortId): number {
  switch (sort) {
    case 'monthlyGain':
      return row.monthlyGainPen ?? Number.NEGATIVE_INFINITY;
    case 'pricePen':
      return row.pricePen;
    case 'coverage':
      return row.coveragePct ?? Number.NEGATIVE_INFINITY;
    case 'aporte':
      return row.monthlyContributionPen ?? Number.POSITIVE_INFINITY;
    case 'cuota':
      return row.paymentPen ?? Number.POSITIVE_INFINITY;
    case 'descuento':
      return row.discountPct ?? Number.NEGATIVE_INFINITY;
    case 'inicial100':
      return row.downPaymentPctForFullCoverage ?? Number.POSITIVE_INFINITY;
    case 'location':
      return row.locationScore ?? Number.NaN;
    case 'grossYield':
      return grossYieldPct(row.grossRentPen, row.pricePen) ?? Number.NaN;
    case 'cashReturn':
      return row.yearlyGainPctOnCash ?? Number.NaN;
    case 'pricePerM2':
      return pricePerM2(row.pricePen, row.areaM2) ?? Number.NaN;
    case 'entryCost':
      return row.entryCostPen ?? Number.NaN;
    case 'newest':
      return row.daysPublished ?? Number.NaN;
  }
}

/** The filters that read the listing itself, before any finance. */
export type ListingFilterInput = Pick<
  DepartamentosQueryInput,
  'districts' | 'sources' | 'priceMin' | 'priceMax' | 'bedroomsMin' | 'bedroomsMax' | 'locationMin' | 'area' | 'areaM2Min' | 'areaM2Max'
>;

/**
 * Districts, sources, price, bedrooms, location and area: the rows queryDepartamentos keeps
 * before its finance step. The map points use it alone, with no finance beyond the gain.
 */
export function filterListings<T extends ListingRow>(listings: T[], input: ListingFilterInput): T[] {
  let list = listings;

  if (input.districts.length > 0) {
    const set = new Set(input.districts);
    list = list.filter((r) => set.has(r.districtSlug));
  }
  if (input.sources.length > 0) {
    const set = new Set<SourceId>(input.sources);
    list = list.filter((r) => r.copies.some((c) => c.source != null && set.has(c.source)));
  }
  if (input.priceMin != null) list = list.filter((r) => r.pricePen >= input.priceMin!);
  if (input.priceMax != null) list = list.filter((r) => r.pricePen <= input.priceMax!);
  if (input.bedroomsMin != null) {
    list = list.filter((r) => r.bedrooms != null && r.bedrooms >= input.bedroomsMin!);
  }
  if (input.bedroomsMax != null) {
    list = list.filter((r) => r.bedrooms != null && r.bedrooms <= input.bedroomsMax!);
  }
  if (input.areaM2Min != null) list = list.filter((r) => r.areaM2 != null && r.areaM2 >= input.areaM2Min!);
  if (input.areaM2Max != null) list = list.filter((r) => r.areaM2 != null && r.areaM2 <= input.areaM2Max!);
  if (input.locationMin != null) {
    list = list.filter((r) => r.locationScore != null && r.locationScore >= input.locationMin!);
  }
  if (input.area) {
    const rings = [input.area];
    list = list.filter((r) => r.lat != null && r.lon != null && pointInPolygon({ lat: r.lat, lon: r.lon }, rings));
  }

  return list;
}

/**
 * The finance for one listing, and whether the cash reaches it. Out of reach: the cash does
 * not cover the purchase costs, so every money number would describe a purchase the
 * investor cannot make.
 */
function listingMoney(listing: ListingRow, panel: PanelAssumptions, fixed: FixedAssumptions) {
  const finance = financeForListing(listing, panel, fixed);
  const loan = finance?.loan ?? loanForListing(listing, panel, fixed);
  return { finance, loan, reachable: isReachable(loan) };
}

const isReachable = (loan: { outOfReach: boolean } | null | undefined) => !loan?.outOfReach;

/** The monthly gain queryDepartamentos shows for this listing, without the rest of its finance. */
export function monthlyGainFor(listing: ListingRow, panel: PanelAssumptions, fixed: FixedAssumptions): number | null {
  // No finance (no rent or no price) means no gain, so the loan alone is not worth computing.
  const finance = financeForListing(listing, panel, fixed);
  return finance && isReachable(finance.loan) ? finance.monthlyGainPen : null;
}

/**
 * One-pass finance over the SQL/client-filtered candidates, then coverage filter,
 * sort, stats, and page slice.
 */
export function queryDepartamentos(
  listings: ListingRow[],
  fixed: FixedAssumptions,
  input: DepartamentosQueryInput
): DepartamentosQueryResult {
  const pageSize = input.pageSize ?? DEPARTAMENTOS_PAGE_SIZE;
  const list = filterListings(listings, input);

  // Early payment is the costly part and no sort, filter or stat reads it: it is filled in
  // for the page rows only, from the loan kept here.
  const loans = new Map<string, { loanPen: number; amortizingPaymentPen: number; reachable: boolean }>();
  const withFinance: DepartamentosRow[] = list.map((listing) => {
    const { finance, loan, reachable } = listingMoney(listing, input.panel, fixed);
    if (loan) loans.set(listing.postingId, { loanPen: loan.loanPen, amortizingPaymentPen: loan.amortizingPaymentPen, reachable });
    return {
      ...listing,
      coveragePct: finance?.coveragePct ?? null,
      monthlyContributionPen: finance?.monthlyContributionPen ?? null,
      paymentPen: loan?.paymentPen ?? null,
      downPaymentPctForFullCoverage: finance?.downPaymentPctForFullCoverage ?? null,
      monthlyGainPen: reachable ? (finance?.monthlyGainPen ?? null) : null,
      yearlyGainPctOnCash: reachable ? (finance?.yearlyGainPctOnCash ?? null) : null,
      entryCostPen: reachable ? (finance?.entryCostPen ?? null) : null,
      totalAddedUntilCrossoverPen: reachable ? (finance?.totalAddedUntilCrossoverPen ?? null) : null,
      belowBankMinimum: finance?.belowBankMinimum ?? false,
      outOfReach: loan?.outOfReach ?? false,
      prepayment: null,
      prepaymentLines: null,
    };
  });

  let filtered = withFinance;
  if (input.coverageMin != null) {
    filtered = filtered.filter(
      (r) => r.coveragePct != null && r.coveragePct >= input.coverageMin!
    );
  }

  const coverages = filtered
    .map((r) => r.coveragePct)
    .filter((c): c is number => c != null);
  const aportes = filtered
    .map((r) => r.monthlyContributionPen)
    .filter((a): a is number => a != null);
  const prices = filtered.map((r) => r.pricePen);

  const stats: DepartamentosStats = {
    total: filtered.length,
    withRent: coverages.length,
    coverageMedian: coverages.length ? median(coverages) : null,
    aporteMedian: aportes.length ? median(aportes) : null,
    above40: coverages.filter((c) => c >= 40).length,
    precioMediano: prices.length ? median(prices) : null,
  };

  const dir = input.order === 'asc' ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    const av = sortValue(a, input.sort);
    const bv = sortValue(b, input.sort);
    // NaN means "no value": last in both orders.
    if (Number.isNaN(av) !== Number.isNaN(bv)) return Number.isNaN(av) ? 1 : -1;
    if (av === bv || (Number.isNaN(av) && Number.isNaN(bv))) return a.postingId.localeCompare(b.postingId);
    return av < bv ? -dir : dir;
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize) || 1);
  const page = Math.min(Math.max(1, input.page), pageCount);
  const start = (page - 1) * pageSize;
  const rows = sorted.slice(start, start + pageSize).map((row) => {
    const loan = loans.get(row.postingId);
    if (!loan) return row;
    const prepayment = loan.reachable
      ? prepaymentSavings({
          loanPen: loan.loanPen,
          teaPct: input.panel.tea,
          termYears: input.panel.termYears,
          extraMonthlyPen: input.panel.extraMonthlyPen,
        })
      : null;
    return { ...row, prepayment, prepaymentLines: prepaymentLines(prepayment, loan.amortizingPaymentPen) };
  });

  return { rows, total: sorted.length, page, pageSize, stats };
}
