import type { UrbaniaCardRaw } from '../scraper/src/scrapers/urbania/types';

export const SOURCE_IDS = ['urbania', 'adondevivir', 'proper', 'nexo', 'remax', 'manual'] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/** The shape every source adapter outputs: the Urbania card plus cross-source fields. */
export interface ListingCard extends UrbaniaCardRaw {
  source: SourceId;
  districtSlug: string | null;
  buildingName: string | null;
  unitNumber: string | null;
  developerName: string | null;
  imageUrls: string[];
  projectSourceId: string | null;
  /** The source's own payload, kept as observed. */
  raw: unknown;
}

export function emptyCard(source: SourceId, over: Partial<ListingCard>): ListingCard {
  return {
    sourcePostingId: null,
    sourcePath: null,
    slugPrefix: null,
    slugBedrooms: null,
    postingCode: null,
    kind: 'UNIT',
    operation: null,
    postingType: null,
    realEstateType: null,
    isRecommendation: false,
    url: '',
    title: null,
    description: null,
    priceAmount: null,
    priceCurrency: null,
    priceIsFrom: false,
    pricePenShown: null,
    priceUsdShown: null,
    priceFormatted: null,
    maintenanceAmount: null,
    maintenanceCurrency: null,
    areaTotal: null,
    areaCovered: null,
    bedrooms: null,
    bathrooms: null,
    halfBathrooms: null,
    parkingSpots: null,
    antiquityYears: null,
    features: [],
    areaMin: null,
    areaMax: null,
    bedroomsMin: null,
    bedroomsMax: null,
    unitsCount: null,
    developmentStage: null,
    deliveryDate: null,
    address: null,
    districtName: null,
    subzoneName: null,
    cityName: null,
    locationId: null,
    latitude: null,
    longitude: null,
    publisherId: null,
    publisherName: null,
    publisherTypeId: null,
    status: null,
    modifiedDate: null,
    firstDateOnline: null,
    hasDuplicate: null,
    imageUrl: null,
    source,
    districtSlug: null,
    buildingName: null,
    unitNumber: null,
    developerName: null,
    imageUrls: [],
    projectSourceId: null,
    raw: null,
    ...over,
  };
}

export function fromUrbaniaCard(
  card: UrbaniaCardRaw,
  source: 'urbania' | 'adondevivir',
  districtSlug: string | null,
): ListingCard {
  return emptyCard(source, {
    ...card,
    source,
    districtSlug,
    imageUrls: card.imageUrl ? [card.imageUrl] : [],
    raw: card,
  });
}
