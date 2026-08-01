/**
 * The shape a single Urbania listing card is normalized into, whatever the
 * source of the data was.
 *
 * Everything here is an observation. Nothing is derived, converted or scored:
 * the published amount and its currency are both kept so the conversion can be
 * redone later, and ranges are kept as ranges because a project that offers
 * 21 to 55 m² does not have "an area".
 */

export type UrbaniaKind = 'UNIT' | 'PROJECT';
export type Currency = 'PEN' | 'USD';
export type Operation = 'SALE' | 'RENT';

export interface UrbaniaCardRaw {
  // ---- Identity ----
  /** Urbania's numeric posting id, the only stable identifier on the card. */
  sourcePostingId: string | null;
  /** Full slug path without query string, e.g. "/inmueble/clasificado/veclapin-...-149992030". */
  sourcePath: string | null;
  /** Leading token of the slug, e.g. "veclapin". Correlates with card context, not with age. */
  slugPrefix: string | null;
  /** Bedrooms as Urbania parsed them into the slug. Free cross-check against the features. */
  slugBedrooms: number | null;
  /**
   * The publisher's own reference, as free text. Present on every card and useless as
   * an identifier: real values include "Erika", "FRANS BARBARAN" and "V&CLEI", the last
   * shared by twelve unrelated listings. Kept for debugging, never for identity.
   */
  postingCode: string | null;
  kind: UrbaniaKind;
  operation: Operation | null;
  /** Raw `postingType` ("PROPERTY" | "DEVELOPMENT"). */
  postingType: string | null;
  /** Urbania's property type label, e.g. "Departamentos", "Casas". */
  realEstateType: string | null;
  /** True when the card came from the recommendations carousel, not from the search results. */
  isRecommendation: boolean;
  url: string;

  // ---- Content ----
  title: string | null;
  description: string | null;

  // ---- Price ----
  /** Price as published, preferring PEN when the card carries both currencies. */
  priceAmount: number | null;
  priceCurrency: Currency | null;
  /** True for project cards, whose price is a "desde" lower bound and never a comparable. */
  priceIsFrom: boolean;
  pricePenShown: number | null;
  priceUsdShown: number | null;
  priceFormatted: string | null;
  maintenanceAmount: number | null;
  maintenanceCurrency: Currency | null;

  // ---- Features ----
  /** Total area in m² (CFT100 / "m² tot."). */
  areaTotal: number | null;
  /** Roofed area in m² (CFT101 / "m² útil"). */
  areaCovered: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  halfBathrooms: number | null;
  parkingSpots: number | null;
  /** Age in years as published (CFT5). Absent on new builds and on projects. */
  antiquityYears: number | null;
  /** Feature labels as displayed, kept for debugging parser changes. */
  features: string[];

  // ---- Project-only ranges ----
  areaMin: number | null;
  areaMax: number | null;
  bedroomsMin: number | null;
  bedroomsMax: number | null;
  unitsCount: number | null;
  /** "Entrega inmediata" | "En construcción" | "En planos". */
  developmentStage: string | null;
  /** e.g. "Octubre 2027". */
  deliveryDate: string | null;

  // ---- Location ----
  /** Street address as published, when the publisher made it visible. */
  address: string | null;
  /** District name from Urbania's own location tree ("Lince"). */
  districtName: string | null;
  /** Sub-zone within the district, when Urbania has one. */
  subzoneName: string | null;
  cityName: string | null;
  /** Urbania's location id for the district, e.g. "V1-D-51119493". */
  locationId: string | null;
  latitude: number | null;
  longitude: number | null;

  // ---- Publisher ----
  publisherId: string | null;
  publisherName: string | null;
  /** Urbania's publisher type id: 2/3 are agencies and developers, 4 is an individual. */
  publisherTypeId: string | null;

  // ---- Platform metadata ----
  /** "ONLINE" while the listing is live. */
  status: string | null;
  /** Last time the publisher touched the listing, per Urbania. */
  modifiedDate: string | null;
  /** When the listing first went online. Only projects reliably carry it. */
  firstDateOnline: string | null;
  /** True when Urbania itself flags the listing as duplicated. */
  hasDuplicate: boolean | null;
  imageUrl: string | null;
}

export interface UrbaniaPageParse {
  /** Cards that are genuinely results of this search, carousel excluded. */
  cards: UrbaniaCardRaw[];
  /** Cards from the recommendations carousel, kept for reporting only. */
  recommendations: UrbaniaCardRaw[];
  /** Total matches Urbania claims for the search. */
  totalResults: number | null;
  /** Number of pages Urbania says the result set has. */
  totalPages: number | null;
  /** Results per page, as reported. */
  pageSize: number | null;
  /** Whether the numbers above came from the embedded state or from the DOM. */
  source: 'state' | 'dom';
  /** The results list container exists in the HTML, so the page rendered. */
  hasResultsContainer: boolean;
}
