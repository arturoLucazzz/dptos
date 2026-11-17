/**
 * Client-side finance for one listing row, given the panel and the fixed costs.
 */

import { financeFrom, type FixedAssumptions, type PanelAssumptions } from "@/lib/assumption-defaults";
import { monthlyCosts, purchaseCosts } from "@/lib/costs";
import { listingFinance, loanFor, type ListingFinance, type Loan } from "@/lib/finance";
import type { ListingRow } from "@/lib/listing-row";

/** Monthly payment from price + panel. Does not need a rent estimate. */
export function loanForListing(
  listing: ListingRow,
  panel: PanelAssumptions,
  fixed: FixedAssumptions
): Loan | null {
  if (!(listing.pricePen > 0)) return null;
  const purchase = purchaseCosts({
    pricePen: listing.pricePen,
    isFirstSaleFromDeveloper: listing.isFirstSaleFromDeveloper,
    assumptions: fixed,
  });
  return loanFor({
    pricePen: listing.pricePen,
    assumptions: financeFrom(panel, fixed),
    purchaseCostsPen: purchase.totalPen,
  });
}

export function financeForListing(
  listing: ListingRow,
  panel: PanelAssumptions,
  fixed: FixedAssumptions
): ListingFinance | null {
  if (!(listing.pricePen > 0)) return null;
  // Without a rent estimate there is nothing honest to say about coverage.
  if (listing.grossRentPen == null) return null;

  const purchase = purchaseCosts({
    pricePen: listing.pricePen,
    isFirstSaleFromDeveloper: listing.isFirstSaleFromDeveloper,
    assumptions: fixed,
  });
  const monthly = monthlyCosts({
    pricePen: listing.pricePen,
    areaM2: listing.areaM2,
    districtSlug: listing.districtSlug,
    publishedMaintenancePen: listing.maintenancePen,
    assumptions: fixed,
  });

  return listingFinance({
    pricePen: listing.pricePen,
    grossRentPen: listing.grossRentPen,
    monthlyCostsPen: monthly.totalPen,
    purchaseCostsPen: purchase.totalPen,
    assumptions: financeFrom(panel, fixed),
  });
}

export function formatPen(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `S/ ${value.toLocaleString("es-PE", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}`;
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("es-PE", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}%`;
}
