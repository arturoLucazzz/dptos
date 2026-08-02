/**
 * The thin listing projection shared by the API and (for favorites) the RSC pages.
 *
 * Roughly ten numbers per row plus a few strings. Coverage, payment and entry cost
 * are *not* here: they depend on Hipoteca params and are computed per request in
 * `queryDepartamentos` so the browser only receives one page of results.
 *
 * Gross rent *is* here, labelled as estimated, because it comes from the rent index
 * which needs the whole rental market.
 */

export interface ListingRow {
  postingId: string;
  propertyId: string | null;
  sourcePostingId: string;
  /** Relative path on Urbania, for linking out. */
  sourcePath: string | null;
  districtSlug: string;
  districtName: string;
  operation: 'SALE' | 'RENT';
  pricePen: number;
  areaM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  antiquityYears: number | null;
  /** Best available signal for the "a estrenar" fair-price premium. */
  isNew: boolean;
  /**
   * Best available signal for the alcabala first-sale exemption. Stricter than
   * `isNew`: only antiquity zero, because a two-year-old flat resold by its first
   * owner still pays the full tax.
   */
  isFirstSaleFromDeveloper: boolean;
  maintenancePen: number | null;
  /** Median rent for the district × bedrooms, or null when the sample is too thin. */
  grossRentPen: number | null;
  rentSampleN: number | null;
  rentConfidence: 'high' | 'low' | null;
  /** Positive means asking below the model. Null when the model cannot speak. */
  discountPct: number | null;
  fairPricePen: number | null;
  fairPriceConfidence: 'high' | 'low' | null;
  daysPublished: number | null;
  daysPublishedEstimated: boolean;
  /** Distinct live listings on the same property. */
  listingCount: number;
  /** Times the asking price has fallen across snapshots. */
  priceCutCount: number;
  /** Relative drop from peak ask to current, 0–1. */
  totalCutPct: number;
  /** Live / monthly sales in the district; null until something has sold. */
  inventoryMonths: number | null;
  /** 0–100 shortlist score for likelihood of a price cut. */
  priceCutScore: number;
  qualityFlags: string[];
  address: string | null;
  title: string | null;
  imageUrl: string | null;
  favorite: boolean;
  discarded: boolean;
}
