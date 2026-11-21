/**
 * The thin listing projection shared by the API and the server pages (Inicio, Mis inversiones, Mercado).
 *
 * Roughly ten numbers per row plus a few strings. Coverage, payment and entry cost
 * are *not* here: they depend on Hipoteca params and are computed per request in
 * `queryDepartamentos` so the browser only receives one page of results.
 *
 * Gross rent *is* here, labelled as estimated, because it comes from the rent index
 * which needs the whole rental market.
 *
 * One row per property: the posting with the lowest live price (the "official"
 * price) speaks for it, and every copy of the same apartment is listed in `copies`.
 */

import type { LocationReason } from './location/score';

import type { SourceId } from './listing-card';
import type { ListingCopy } from './official-price';

export interface DuplicateFlag {
  candidateId: string;
  level: 'MEDIUM' | 'LOW';
  otherPropertyId: string;
}

export interface ListingRow {
  /** The official posting: the lowest live price among the property's copies. */
  postingId: string;
  propertyId: string | null;
  sourcePostingId: string;
  /** Source of the official posting. */
  source: SourceId | null;
  /** Relative path on Urbania, for linking out. */
  sourcePath: string | null;
  /** The official posting's own page, when known. */
  url: string | null;
  districtSlug: string;
  districtName: string;
  operation: 'SALE' | 'RENT';
  /** Official price: the lowest live price among the copies. */
  pricePen: number;
  /** Highest live price among the copies; equals `pricePen` with one copy. */
  priceMaxPen: number;
  /** Every live copy of this property, lowest price first. */
  copies: ListingCopy[];
  /** Open MEDIUM or LOW duplicate candidates this property is part of. */
  duplicateFlags: DuplicateFlag[];
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
  /** Local rent from nearby listings, else the district × bedrooms median; null with neither. */
  grossRentPen: number | null;
  rentSampleN: number | null;
  rentConfidence: 'high' | 'low' | null;
  /** 75th percentile of nearby rents × area. Text only: the money numbers never use it. */
  rentHighPen: number | null;
  /** True when grossRentPen comes from nearby rent listings, false for the district median. */
  rentIsLocal: boolean;
  /** Distance to the farthest rent used, when the rent is local. */
  rentMaxDistanceM: number | null;
  /** Stored location score (0–10) and its parts; null status before the first refresh. */
  locationStatus: 'OK' | 'OUTSIDE_LIMA' | 'NO_COORDINATES' | null;
  locationScore: number | null;
  locationLivability: number | null;
  locationDemand: number | null;
  locationReasons: LocationReason[];
  /** Positive means asking below the model. Null when the model cannot speak. */
  discountPct: number | null;
  fairPricePen: number | null;
  fairPriceConfidence: 'high' | 'low' | null;
  daysPublished: number | null;
  daysPublishedEstimated: boolean;
  /** Live copies of the same property: `copies.length`. */
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
  /** Property coordinates, when known. */
  lat: number | null;
  lon: number | null;
  address: string | null;
  title: string | null;
  imageUrl: string | null;
  favorite: boolean;
  discarded: boolean;
}
