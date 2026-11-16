/**
 * Filter / finance / sort / paginate the sale listings universe for the
 * departamentos table. Runs on the server so the browser only holds one page.
 */

import { DEFAULT_PANEL, type FixedAssumptions, type PanelAssumptions } from './assumption-defaults';
import { financeForListing, loanForListing } from './listing-finance';
import type { SourceId } from './listing-card';
import type { ListingRow } from './listing-row';
import { median } from './linalg';
import { isSourceId } from './official-price';

export const DEPARTAMENTOS_PAGE_SIZE = 50;

export const DEPARTAMENTOS_SORT_IDS = [
  'pricePen',
  'coverage',
  'aporte',
  'cuota',
  'descuento',
  'inicial100',
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

function parseOptionalNumber(raw: string | null): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalInt(raw: string | null): number | null {
  const n = parseOptionalNumber(raw);
  return n == null ? null : Math.round(n);
}

export function isDepartamentosSortId(value: string): value is DepartamentosSortId {
  return (DEPARTAMENTOS_SORT_IDS as readonly string[]).includes(value);
}

/** Parse GET /api/departamentos search params into a typed query. */
export function parseDepartamentosSearchParams(params: URLSearchParams): DepartamentosQueryInput {
  const districtsRaw = params.get('districts') ?? params.get('distrito') ?? '';
  const districts = districtsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const sources = (params.get('fuentes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(isSourceId);

  const sortRaw = params.get('sort') ?? 'coverage';
  const sort = isDepartamentosSortId(sortRaw) ? sortRaw : 'coverage';
  const orderRaw = params.get('order') ?? 'desc';
  const order = orderRaw === 'asc' ? 'asc' : 'desc';

  const pageRaw = parseOptionalInt(params.get('page'));
  const page = pageRaw != null && pageRaw >= 1 ? pageRaw : 1;

  return {
    districts,
    sources,
    priceMin: parseOptionalNumber(params.get('priceMin')),
    priceMax: parseOptionalNumber(params.get('priceMax')),
    bedroomsMin: parseOptionalInt(params.get('bedroomsMin')),
    bedroomsMax: parseOptionalInt(params.get('bedroomsMax')),
    coverageMin: parseOptionalNumber(params.get('coverageMin')),
    panel: {
      downPaymentPct: parseOptionalNumber(params.get('inicial')) ?? DEFAULT_PANEL.downPaymentPct,
      tea: parseOptionalNumber(params.get('tea')) ?? DEFAULT_PANEL.tea,
      tcea: parseOptionalNumber(params.get('tcea')) ?? DEFAULT_PANEL.tcea,
      termYears: parseOptionalInt(params.get('plazo')) ?? DEFAULT_PANEL.termYears,
    },
    sort,
    order,
    page,
  };
}

function sortValue(row: DepartamentosRow, sort: DepartamentosSortId): number {
  switch (sort) {
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
  }
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
  let list = listings;

  if (input.districts.length > 0) {
    const set = new Set(input.districts);
    list = list.filter((r) => set.has(r.districtSlug));
  }
  if (input.sources.length > 0) {
    const set = new Set<SourceId>(input.sources);
    list = list.filter((r) => r.copies.some((c) => set.has(c.source)));
  }
  if (input.priceMin != null) list = list.filter((r) => r.pricePen >= input.priceMin!);
  if (input.priceMax != null) list = list.filter((r) => r.pricePen <= input.priceMax!);
  if (input.bedroomsMin != null) {
    list = list.filter((r) => r.bedrooms != null && r.bedrooms >= input.bedroomsMin!);
  }
  if (input.bedroomsMax != null) {
    list = list.filter((r) => r.bedrooms != null && r.bedrooms <= input.bedroomsMax!);
  }

  const withFinance: DepartamentosRow[] = list.map((listing) => {
    const finance = financeForListing(listing, input.panel, fixed);
    const loan = finance?.loan ?? loanForListing(listing, input.panel, fixed);
    return {
      ...listing,
      coveragePct: finance?.coveragePct ?? null,
      monthlyContributionPen: finance?.monthlyContributionPen ?? null,
      paymentPen: loan?.paymentPen ?? null,
      downPaymentPctForFullCoverage: finance?.downPaymentPctForFullCoverage ?? null,
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
    if (av === bv) return a.postingId.localeCompare(b.postingId);
    return av < bv ? -dir : dir;
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize) || 1);
  const page = Math.min(Math.max(1, input.page), pageCount);
  const start = (page - 1) * pageSize;
  const rows = sorted.slice(start, start + pageSize);

  return { rows, total: sorted.length, page, pageSize, stats };
}
