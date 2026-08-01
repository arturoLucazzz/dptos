/**
 * Parse Urbania search listing HTML from the rendered DOM.
 *
 * This is the fallback for when `__PRELOADED_STATE__` is missing or unparseable
 * (see parse-preloaded-state.ts, which is the primary path). It yields fewer
 * fields, so anything reading a card has to tolerate nulls either way.
 *
 * One thing only the DOM has: the recommendations carousel, which is rendered
 * client-side from postings in other districts. Those are not results of the
 * search that produced the page and must not be counted as such.
 */

import { load, type CheerioAPI } from 'cheerio';
import type { Currency, UrbaniaCardRaw, UrbaniaKind, UrbaniaPageParse } from './types';

/** A wrapped selection, as returned by `$(...)`. */
type Selection = ReturnType<CheerioAPI>;

const RESULTS_CONTAINER_SELECTOR = '.main-module__list-postings-container';
const CAROUSEL_CONTAINER_SELECTOR = '.postingsList-module__carrousel-container';
const CARD_SELECTOR = '.postingCardLayout-module__posting-card-layout';
const PRICE_SELECTOR = '.postingPrices-module__price';
const PRICE_FROM_SELECTOR = '.postingPrices-module__price-from';
const EXPENSES_SELECTOR = '.postingPrices-module__expenses';
const FEATURES_SELECTOR = '.postingMainFeatures-module__posting-main-features-span';
const LOCATION_ADDRESS_SELECTOR = '.postingLocations-module__location-address';
const LOCATION_TEXT_SELECTOR = '.postingLocations-module__location-text';
const DESCRIPTION_LINK_SELECTOR = '.postingCard-module__posting-description a';
const GALLERY_IMG_SELECTOR = '.postingGallery-module__gallery-container img[src]';
const STAGE_SELECTOR = '.developmentStageStepsData-module__stage-container';
const PUBLISHER_LOGO_SELECTOR = '.postingPublisher-module__logo';
const RESULTS_TITLE_SELECTOR = '.postingsTitle-module__title';
const PAGING_SELECTOR = '.paging-module__container-paging';

/** Currency symbols Urbania uses, longest first so `US$` wins over `$`. */
const CURRENCY_PATTERN = /(S\/\.?|US\$|USD|U\$S|\$)\s*([\d.,]+)/g;

function normalizeCurrency(symbol: string): Currency {
  return /S\//.test(symbol) ? 'PEN' : 'USD';
}

/**
 * Parse a money literal where `,` is the thousands separator and `.` the decimal
 * point, tolerating the reverse convention when only dots appear in groups of three.
 */
function parseMoneyNumber(raw: string): number | null {
  let text = raw.trim();
  if (!text) return null;
  const hasComma = text.includes(',');
  const dotsAsThousands = !hasComma && /^\d{1,3}(\.\d{3})+$/.test(text);
  text = dotsAsThousands ? text.replace(/\./g, '') : text.replace(/,/g, '');
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

export interface ParsedMoney {
  amount: number;
  currency: Currency;
}

/** Every currency amount in a string, in the order they appear. */
export function parseMoneyList(text: string): ParsedMoney[] {
  const normalized = text.replace(/\s+/g, ' ');
  const out: ParsedMoney[] = [];
  for (const match of normalized.matchAll(CURRENCY_PATTERN)) {
    const amount = parseMoneyNumber(match[2]);
    if (amount == null) continue;
    out.push({ amount, currency: normalizeCurrency(match[1]) });
  }
  return out;
}

function firstInt(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isNaN(n) ? null : n;
}

export interface ParsedFeatures {
  areaTotal: number | null;
  areaCovered: number | null;
  areaMin: number | null;
  areaMax: number | null;
  bedrooms: number | null;
  bedroomsMin: number | null;
  bedroomsMax: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  unitsCount: number | null;
  antiquityYears: number | null;
}

/**
 * Extract the structured features from strings like "64 m² tot.", "1 a 2 dorm.",
 * "2 baños", "1 estac.", "126 un.".
 *
 * Ranges only appear on project cards, where a single value would be a lie.
 */
export function parseFeatures(features: string[]): ParsedFeatures {
  const result: ParsedFeatures = {
    areaTotal: null,
    areaCovered: null,
    areaMin: null,
    areaMax: null,
    bedrooms: null,
    bedroomsMin: null,
    bedroomsMax: null,
    bathrooms: null,
    parkingSpots: null,
    unitsCount: null,
    antiquityYears: null,
  };

  for (const raw of features) {
    const f = raw.replace(/\s+/g, ' ').trim();
    if (!f) continue;

    if (/m²/.test(f)) {
      const isCovered = /m²\s*(ú|u)til/i.test(f);
      const range = f.match(/(\d+(?:[.,]\d+)?)\s*a\s*(\d+(?:[.,]\d+)?)\s*m²/i);
      if (range) {
        result.areaMin = parseMoneyNumber(range[1]);
        result.areaMax = parseMoneyNumber(range[2]);
      } else {
        const single = f.match(/(\d+(?:[.,]\d+)?)\s*m²/i);
        const value = single ? parseMoneyNumber(single[1]) : null;
        if (value != null) {
          if (isCovered) result.areaCovered = value;
          else result.areaTotal = value;
        }
      }
      continue;
    }

    if (/dorm/i.test(f)) {
      const range = f.match(/(\d+)\s*a\s*(\d+)\s*dorm/i);
      if (range) {
        result.bedroomsMin = parseInt(range[1], 10);
        result.bedroomsMax = parseInt(range[2], 10);
      } else {
        result.bedrooms = firstInt(f, /(\d+)\s*dorm/i);
      }
      continue;
    }

    if (/ba(ñ|n)o/i.test(f)) {
      result.bathrooms = firstInt(f, /(\d+)\s*ba/i);
      continue;
    }

    if (/estac|coch|garaj/i.test(f)) {
      result.parkingSpots = firstInt(f, /(\d+)\s*(estac|coch|garaj)/i);
      continue;
    }

    if (/\bun\b|unidad/i.test(f)) {
      result.unitsCount = firstInt(f, /(\d+)\s*(un|unidad)/i);
      continue;
    }

    if (/estrenar/i.test(f)) {
      result.antiquityYears = 0;
      continue;
    }

    if (/a(ñ|n)o/i.test(f)) {
      result.antiquityYears = firstInt(f, /(\d+)\s*a(?:ñ|n)o/i);
    }
  }

  return result;
}

/** Strip the query string and HTML entity escaping from a `data-to-posting` value. */
function cleanPath(raw: string): string {
  const decoded = raw.replace(/&amp;/g, '&');
  return decoded.includes('?') ? decoded.split('?')[0] : decoded;
}

/** The trailing number of the slug is the posting id, and the only stable part of it. */
function idFromPath(path: string): string | null {
  const match = path.match(/-(\d+)\/?$/);
  return match ? match[1] : null;
}

function slugPrefixFromPath(path: string): string | null {
  const last = path.split('/').filter(Boolean).pop();
  if (!last) return null;
  const match = last.match(/^([a-z]+)-/i);
  return match ? match[1].toLowerCase() : null;
}

function kindFromPath(path: string, postingType: string | null): UrbaniaKind {
  if (path.includes('/proyecto/')) return 'PROJECT';
  if (path.includes('/clasificado/')) return 'UNIT';
  return postingType === 'DEVELOPMENT' ? 'PROJECT' : 'UNIT';
}

function parseCard(
  $: CheerioAPI,
  $card: Selection,
  baseUrl: string,
  isRecommendation: boolean
): UrbaniaCardRaw {
  const rawPath = $card.attr('data-to-posting') || '';
  const sourcePath = rawPath ? cleanPath(rawPath) : null;
  const postingType = $card.attr('data-posting-type') || null;

  const sourcePostingId = $card.attr('data-id') || (sourcePath ? idFromPath(sourcePath) : null);

  const priceEl = $card.find(PRICE_SELECTOR).first();
  const priceText = priceEl.length ? priceEl.text().replace(/\s+/g, ' ').trim() : '';
  const prices = parseMoneyList(priceText);
  const pen = prices.find((p) => p.currency === 'PEN') ?? null;
  const usd = prices.find((p) => p.currency === 'USD') ?? null;
  const primary = pen ?? prices[0] ?? null;

  const expensesEl = $card.find(EXPENSES_SELECTOR).first();
  const maintenance = expensesEl.length ? parseMoneyList(expensesEl.text())[0] ?? null : null;

  const features: string[] = [];
  $card.find(FEATURES_SELECTOR).each((_, span) => {
    const t = $(span).text().replace(/\s+/g, ' ').trim();
    if (t) features.push(t);
  });
  const parsed = parseFeatures(features);

  const addressEl = $card.find(LOCATION_ADDRESS_SELECTOR).first();
  const locationTextEl = $card.find(LOCATION_TEXT_SELECTOR).first();
  const locationText = locationTextEl.length
    ? locationTextEl.text().replace(/\s+/g, ' ').trim() || null
    : null;

  const descLink = $card.find(DESCRIPTION_LINK_SELECTOR).first();

  let imageUrl: string | null = null;
  const img = $card.find(GALLERY_IMG_SELECTOR).first();
  if (img.length) {
    const src = img.attr('src') || img.attr('data-flickity-lazyload');
    if (src && !src.startsWith('data:')) imageUrl = src.split('?')[0];
  }

  const logo = $card.find(PUBLISHER_LOGO_SELECTOR).first();

  let developmentStage: string | null = null;
  let deliveryDate: string | null = null;
  const stageEl = $card.find(STAGE_SELECTOR).first();
  if (stageEl.length) {
    const parts = stageEl
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .split(' · ')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts[0]) developmentStage = parts[0];
    if (parts[1] && parts[1].toLowerCase().startsWith('entrega ')) {
      deliveryDate = parts[1].replace(/^Entrega\s+/i, '').trim() || null;
    }
  }

  return {
    sourcePostingId,
    sourcePath,
    slugPrefix: sourcePath ? slugPrefixFromPath(sourcePath) : null,
    slugBedrooms: sourcePath ? firstInt(sourcePath, /-(\d+)-dormitorio/i) : null,
    postingCode: null,
    kind: kindFromPath(sourcePath ?? '', postingType),
    operation: null,
    postingType,
    realEstateType: null,
    isRecommendation,
    url: sourcePath ? (sourcePath.startsWith('http') ? sourcePath : `${baseUrl}${sourcePath}`) : '',

    title: descLink.length ? descLink.text().replace(/\s+/g, ' ').trim() || null : null,
    description: null,

    priceAmount: primary?.amount ?? null,
    priceCurrency: primary?.currency ?? null,
    priceIsFrom: $card.find(PRICE_FROM_SELECTOR).length > 0 || /\bdesde\b/i.test(priceText),
    pricePenShown: pen?.amount ?? null,
    priceUsdShown: usd?.amount ?? null,
    priceFormatted: priceText || null,
    maintenanceAmount: maintenance?.amount ?? null,
    maintenanceCurrency: maintenance?.currency ?? null,

    areaTotal: parsed.areaTotal,
    areaCovered: parsed.areaCovered,
    bedrooms: parsed.bedrooms,
    bathrooms: parsed.bathrooms,
    halfBathrooms: null,
    parkingSpots: parsed.parkingSpots,
    antiquityYears: parsed.antiquityYears,
    features,

    areaMin: parsed.areaMin,
    areaMax: parsed.areaMax,
    bedroomsMin: parsed.bedroomsMin,
    bedroomsMax: parsed.bedroomsMax,
    unitsCount: parsed.unitsCount,
    developmentStage,
    deliveryDate,

    address: addressEl.length ? addressEl.text().replace(/\s+/g, ' ').trim() || null : null,
    // The card prints "Lince, Lima", so the district is the part before the comma.
    districtName: locationText ? locationText.split(',')[0].trim() || null : null,
    subzoneName: null,
    cityName: locationText?.includes(',') ? locationText.split(',').pop()!.trim() || null : null,
    locationId: null,
    latitude: null,
    longitude: null,

    publisherId: null,
    publisherName: logo.length ? logo.attr('alt')?.trim() || null : null,
    publisherTypeId: null,

    status: null,
    modifiedDate: null,
    firstDateOnline: null,
    hasDuplicate: null,
    imageUrl,
  };
}

/** Total matches from the results heading, e.g. "174 Departamentos ... en Lince, Lima". */
function parseTotalResults($: CheerioAPI): number | null {
  const text = $(RESULTS_TITLE_SELECTOR).first().text().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const match = text.match(/([\d.,]+)/);
  if (!match) return null;
  const n = parseMoneyNumber(match[1]);
  return n == null ? null : Math.round(n);
}

function parseLastPageNumber($: CheerioAPI): number | null {
  const numbers: number[] = [];
  $(`${PAGING_SELECTOR} a, ${PAGING_SELECTOR} li`).each((_, el) => {
    const n = parseInt($(el).text().trim(), 10);
    if (!Number.isNaN(n)) numbers.push(n);
  });
  return numbers.length ? Math.max(...numbers) : null;
}

export function parseUrbaniaDomPage(html: string, baseUrl: string): UrbaniaPageParse {
  const $ = load(html);

  const carouselCards = new Set<unknown>();
  $(`${CAROUSEL_CONTAINER_SELECTOR} ${CARD_SELECTOR}`).each((_, el) => {
    carouselCards.add(el);
  });

  const cards: UrbaniaCardRaw[] = [];
  const recommendations: UrbaniaCardRaw[] = [];

  $(CARD_SELECTOR).each((_, el) => {
    const $card = $(el);
    // Carousel cards carry no `data-id`; either signal alone is enough to demote them.
    const isRecommendation = carouselCards.has(el) || !$card.attr('data-id');
    const card = parseCard($, $card, baseUrl, isRecommendation);
    (isRecommendation ? recommendations : cards).push(card);
  });

  return {
    cards,
    recommendations,
    totalResults: parseTotalResults($),
    totalPages: parseLastPageNumber($),
    pageSize: cards.length || null,
    source: 'dom',
    hasResultsContainer: $(RESULTS_CONTAINER_SELECTOR).length > 0,
  };
}

/** Carousel cards, which only exist in the DOM, not in the embedded state. */
export function parseUrbaniaDomRecommendations(html: string, baseUrl: string): UrbaniaCardRaw[] {
  return parseUrbaniaDomPage(html, baseUrl).recommendations;
}
