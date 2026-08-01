/**
 * Parse Urbania's `window.__PRELOADED_STATE__` blob, which is the same data the
 * page renders from.
 *
 * This is the primary parser, with the DOM as fallback, because the state carries
 * fields the cards never display: the age in years, the geolocation, the
 * publisher id, the publisher's own listing code, the exact result total, and
 * whether Urbania itself considers the listing duplicated.
 */

import { load } from 'cheerio';
import type { Currency, Operation, UrbaniaCardRaw, UrbaniaKind, UrbaniaPageParse } from './types';

/** Feature ids Urbania uses on listing cards. Stable across property types. */
const FEATURE = {
  totalArea: 'CFT100',
  coveredArea: 'CFT101',
  bedrooms: 'CFT2',
  bathrooms: 'CFT3',
  halfBathrooms: 'CFT4',
  antiquity: 'CFT5',
  parking: 'CFT7',
} as const;

/** Currency ids in Urbania's price objects. */
const CURRENCY_BY_ID: Record<string, Currency> = { '6': 'PEN', '2': 'USD' };

interface StateFeature {
  featureId?: string;
  label?: string | null;
  measure?: string | null;
  value?: string | number | null;
}

interface StatePrice {
  currencyId?: string | null;
  amount?: number | null;
  formattedAmount?: string | null;
  currency?: string | null;
}

interface StatePosting {
  postingId?: string;
  postingCode?: string | null;
  title?: string | null;
  generatedTitle?: string | null;
  descriptionNormalized?: string | null;
  url?: string | null;
  postingType?: string | null;
  status?: string | null;
  modified_date?: string | null;
  alphanumeric_key?: string | null;
  avisoDuplicado?: string | null;
  realEstateType?: { name?: string | null } | null;
  priceOperationTypes?: Array<{
    operationType?: { name?: string | null; operationTypeId?: string | null } | null;
    prices?: StatePrice[] | null;
  }> | null;
  expenses?: StatePrice | null;
  mainFeatures?: Record<string, StateFeature> | null;
  generalFeatures?: Record<string, StateFeature> | null;
  publisher?: {
    publisherId?: string | null;
    name?: string | null;
    publisherTypeId?: string | null;
  } | null;
  publication?: { beginDate?: number | null; firstDateOnline?: number | null } | null;
  postingLocation?: {
    address?: { name?: string | null } | null;
    location?: StateLocation | null;
    postingGeolocation?: { geolocation?: { latitude?: number | null; longitude?: number | null } | null } | null;
  } | null;
  visiblePictures?: { pictures?: Array<{ url730x532?: string | null; url360x266?: string | null }> | null } | null;
}

interface StateLocation {
  locationId?: string | null;
  name?: string | null;
  label?: string | null;
  parent?: StateLocation | null;
}

interface StateTuple<T> {
  tuple0?: T | null;
  tuple1?: T | null;
}

interface StateDevelopment {
  totalArea?: StateTuple<number> | null;
  coveredArea?: StateTuple<number> | null;
  minorPrices?: StateTuple<StatePrice> | null;
  numberOfUnits?: number | null;
  rooms?: StateTuple<number> | null;
  bathrooms?: StateTuple<number> | null;
  garages?: StateTuple<number> | null;
  delivery?: string | null;
  steps?: Array<{ status?: string | null; stage?: string | null }> | null;
}

interface StateListStore {
  listPostings?: StatePosting[] | null;
  paging?: {
    total?: number | null;
    totalPages?: number | null;
    limit?: number | null;
    currentPage?: number | null;
  } | null;
  developmentData?: Record<string, StateDevelopment> | null;
  totalPosting?: string | null;
}

/**
 * Pull a balanced JSON object out of an inline script. The script holds several
 * assignments, so scanning to the last brace would swallow the ones that follow.
 */
function extractJsonObject(text: string, marker: string): string | null {
  const markerAt = text.indexOf(marker);
  if (markerAt === -1) return null;
  const start = text.indexOf('{', markerAt);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export function extractPreloadedListStore(html: string): StateListStore | null {
  const $ = load(html);
  const script = $('#preloadedData').html() ?? '';
  const json = extractJsonObject(script, '__PRELOADED_STATE__');
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { listStore?: StateListStore };
    return parsed.listStore ?? null;
  } catch {
    return null;
  }
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function featureValue(posting: StatePosting, featureId: string): number | null {
  const feature = posting.mainFeatures?.[featureId] ?? posting.generalFeatures?.[featureId];
  return feature ? numberOrNull(feature.value) : null;
}

function featureLabels(posting: StatePosting): string[] {
  const groups = [posting.mainFeatures, posting.generalFeatures];
  const labels: string[] = [];
  for (const group of groups) {
    for (const feature of Object.values(group ?? {})) {
      if (!feature?.label) continue;
      const measure = feature.measure ? ` ${feature.measure}` : '';
      labels.push(`${feature.label}: ${feature.value ?? ''}${measure}`.trim());
    }
  }
  return labels;
}

function operationFromName(name: string | null | undefined): Operation | null {
  if (!name) return null;
  if (/venta/i.test(name)) return 'SALE';
  if (/alquiler|arriendo/i.test(name)) return 'RENT';
  return null;
}

function currencyOf(price: StatePrice | null | undefined): Currency | null {
  if (!price) return null;
  const byId = price.currencyId ? CURRENCY_BY_ID[price.currencyId] : undefined;
  if (byId) return byId;
  if (price.currency && /S\//.test(price.currency)) return 'PEN';
  if (price.currency && /USD|\$/.test(price.currency)) return 'USD';
  return null;
}

/** Walk Urbania's location tree, which nests district inside city inside province. */
function locationByLabel(location: StateLocation | null | undefined, label: string): StateLocation | null {
  let node = location ?? null;
  while (node) {
    if (node.label === label) return node;
    node = node.parent ?? null;
  }
  return null;
}

function slugPrefixFromPath(path: string): string | null {
  const last = path.split('/').filter(Boolean).pop();
  if (!last) return null;
  const match = last.match(/^([a-z]+)-/i);
  return match ? match[1].toLowerCase() : null;
}

function slugBedroomsFromPath(path: string): number | null {
  const match = path.match(/-(\d+)-dormitorio/i);
  return match ? parseInt(match[1], 10) : null;
}

function kindOf(posting: StatePosting): UrbaniaKind {
  const path = posting.url ?? '';
  if (path.includes('/proyecto/')) return 'PROJECT';
  if (path.includes('/clasificado/')) return 'UNIT';
  return posting.postingType === 'DEVELOPMENT' ? 'PROJECT' : 'UNIT';
}

function isoFromEpoch(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

function mapPosting(
  posting: StatePosting,
  development: StateDevelopment | undefined,
  baseUrl: string
): UrbaniaCardRaw {
  const path = posting.url ?? null;
  const kind = kindOf(posting);

  const operationEntry =
    posting.priceOperationTypes?.find((entry) => (entry.prices ?? []).length > 0) ??
    posting.priceOperationTypes?.[0] ??
    null;
  const prices = operationEntry?.prices ?? [];
  const pen = prices.find((p) => currencyOf(p) === 'PEN') ?? null;
  const usd = prices.find((p) => currencyOf(p) === 'USD') ?? null;
  const primary = pen ?? prices[0] ?? null;

  const expenses = posting.expenses ?? null;
  // Urbania stores "no maintenance published" as amount 0, which is not the same
  // as a building that genuinely charges nothing, so 0 is treated as unknown.
  const maintenanceAmount = numberOrNull(expenses?.amount);

  const location = posting.postingLocation?.location ?? null;
  const district = locationByLabel(location, 'ZONA');
  const subzone = locationByLabel(location, 'SUBZONA');
  const city = locationByLabel(location, 'CIUDAD');
  const geo = posting.postingLocation?.postingGeolocation?.geolocation ?? null;

  const picture = posting.visiblePictures?.pictures?.[0] ?? null;
  // The stage the project is at is the step still in progress; the ones after it
  // are TO_DO and the ones before it are done.
  const steps = development?.steps ?? [];
  const stage =
    steps.find((step) => step.status === 'IN_PROGRESS') ??
    [...steps].reverse().find((step) => step.status === 'DONE');

  return {
    sourcePostingId: posting.postingId ?? null,
    sourcePath: path,
    slugPrefix: path ? slugPrefixFromPath(path) : null,
    slugBedrooms: path ? slugBedroomsFromPath(path) : null,
    postingCode: posting.postingCode ?? null,
    kind,
    operation: operationFromName(operationEntry?.operationType?.name),
    postingType: posting.postingType ?? null,
    realEstateType: posting.realEstateType?.name ?? null,
    isRecommendation: false,
    url: path ? (path.startsWith('http') ? path : `${baseUrl}${path}`) : '',

    title: posting.title ?? posting.generatedTitle ?? null,
    description: posting.descriptionNormalized ?? null,

    priceAmount: numberOrNull(primary?.amount),
    priceCurrency: currencyOf(primary),
    priceIsFrom: kind === 'PROJECT',
    pricePenShown: numberOrNull(pen?.amount),
    priceUsdShown: numberOrNull(usd?.amount),
    priceFormatted: primary
      ? `${primary.currency ?? ''} ${primary.formattedAmount ?? primary.amount ?? ''}`.trim()
      : null,
    maintenanceAmount: maintenanceAmount === 0 ? null : maintenanceAmount,
    maintenanceCurrency: maintenanceAmount ? currencyOf(expenses) ?? 'PEN' : null,

    areaTotal: featureValue(posting, FEATURE.totalArea),
    areaCovered: featureValue(posting, FEATURE.coveredArea),
    bedrooms: featureValue(posting, FEATURE.bedrooms),
    bathrooms: featureValue(posting, FEATURE.bathrooms),
    halfBathrooms: featureValue(posting, FEATURE.halfBathrooms),
    parkingSpots: featureValue(posting, FEATURE.parking) ?? development?.garages?.tuple0 ?? null,
    antiquityYears: featureValue(posting, FEATURE.antiquity),
    features: featureLabels(posting),

    areaMin: development?.totalArea?.tuple0 ?? null,
    areaMax: development?.totalArea?.tuple1 ?? null,
    bedroomsMin: development?.rooms?.tuple0 ?? null,
    bedroomsMax: development?.rooms?.tuple1 ?? null,
    unitsCount: development?.numberOfUnits ?? null,
    developmentStage: stage?.stage ?? null,
    deliveryDate: development?.delivery ?? null,

    address: posting.postingLocation?.address?.name?.trim() || null,
    districtName: district?.name ?? null,
    // Publishers who leave the sub-zone blank end up with a literal "S/n".
    subzoneName: subzone?.name && !/^s\/?n\.?$/i.test(subzone.name) ? subzone.name : null,
    cityName: city?.name ?? null,
    locationId: district?.locationId ?? null,
    latitude: numberOrNull(geo?.latitude),
    longitude: numberOrNull(geo?.longitude),

    publisherId: posting.publisher?.publisherId ?? null,
    publisherName: posting.publisher?.name ?? null,
    publisherTypeId: posting.publisher?.publisherTypeId ?? null,

    status: posting.status ?? null,
    modifiedDate: posting.modified_date ?? null,
    firstDateOnline: isoFromEpoch(posting.publication?.firstDateOnline ?? posting.publication?.beginDate),
    // "aviso_sinduplicado_1499..." means Urbania found no duplicate for it.
    hasDuplicate: posting.avisoDuplicado == null ? null : !/sinduplicado/i.test(posting.avisoDuplicado),
    imageUrl: picture?.url730x532?.split('?')[0] ?? picture?.url360x266?.split('?')[0] ?? null,
  };
}

/**
 * Parse a search page from its embedded state. Returns null when the blob is
 * missing, which is the signal to fall back to the DOM.
 */
export function parseUrbaniaStatePage(html: string, baseUrl: string): UrbaniaPageParse | null {
  const store = extractPreloadedListStore(html);
  if (!store || !Array.isArray(store.listPostings)) return null;

  const developments = store.developmentData ?? {};
  const cards = store.listPostings.map((posting) =>
    mapPosting(posting, posting.postingId ? developments[posting.postingId] : undefined, baseUrl)
  );

  return {
    cards,
    // The state only ever holds the search results; the carousel is client-side.
    recommendations: [],
    totalResults: store.paging?.total ?? numberOrNull(store.totalPosting),
    totalPages: store.paging?.totalPages ?? null,
    pageSize: store.paging?.limit ?? null,
    source: 'state',
    hasResultsContainer: true,
  };
}
