/**
 * Parse Urbania search listing HTML into raw listing objects.
 *
 * Selectors are based on the DOM structure in examples/urbania.html
 * (HTML saved from the browser for venta-de-departamentos-en-lince--lima--lima).
 */

import { load } from 'cheerio';

export interface UrbaniaCardRaw {
  id: string;
  postingType: string;
  url: string;
  title: string | null;
  priceFormatted: string | null;
  price: number | null;
  location: string | null;
  address: string | null;
  features: string[]; // e.g. ["2 dorm.", "64 m² tot."]
  imageUrl: string | null;
  publisherName?: string | null;
  /** "Entrega inmediata" | "En construcción" | "En planos" (from developmentStageStepsData) */
  developmentStage?: string | null;
  /** e.g. "diciembre 2026" when stage is En construcción / En planos */
  deliveryDate?: string | null;
}

const CARD_SELECTOR = '.postingCardLayout-module__posting-card-layout';
const PRICE_SELECTOR = '.postingPrices-module__price';
const FEATURES_SELECTOR = '.postingMainFeatures-module__posting-main-features-span';
const LOCATION_ADDRESS_SELECTOR = '.postingLocations-module__location-address';
const LOCATION_TEXT_SELECTOR = '.postingLocations-module__location-text';
const DESCRIPTION_LINK_SELECTOR = '.postingCard-module__posting-description a';
const GALLERY_IMG_SELECTOR = '.postingGallery-module__gallery-container img[src]';
const STAGE_SELECTOR = '.developmentStageStepsData-module__stage-container';

function parsePrice(text: string): number | null {
  const match = text.replace(/\s+/g, ' ').match(/S\/\s*([\d,]+)/);
  if (!match) return null;
  const cleaned = match[1].replace(/,/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? null : n;
}

export function parseUrbaniaSearchPage(html: string, baseUrl: string): UrbaniaCardRaw[] {
  const $ = load(html);
  const results: UrbaniaCardRaw[] = [];

  $(CARD_SELECTOR).each((_, el) => {
    const $card = $(el);
    const id = $card.attr('data-id') || '';
    const postingType = $card.attr('data-posting-type') || 'PROPERTY';
    let path = $card.attr('data-to-posting') || '';
    if (path && !path.startsWith('http')) {
      path = path.replace(/&amp;/g, '&');
      path = path.includes('?') ? path.split('?')[0] : path;
    }
    const url = path ? (path.startsWith('http') ? path : `${baseUrl}${path}`) : '';

    const priceEl = $card.find(PRICE_SELECTOR);
    let priceFormatted: string | null = null;
    if (priceEl.length) {
      const raw = priceEl.text().replace(/\s+/g, ' ').trim();
      const match = raw.match(/S\/\s*[\d,]+/);
      priceFormatted = match ? match[0].trim() : null;
    }
    const price = priceFormatted ? parsePrice(priceFormatted) : null;

    const features: string[] = [];
    $card.find(FEATURES_SELECTOR).each((_, span) => {
      const t = $(span).text().trim();
      if (t) features.push(t);
    });

    const addressEl = $card.find(LOCATION_ADDRESS_SELECTOR).first();
    const locationTextEl = $card.find(LOCATION_TEXT_SELECTOR).first();
    const address = addressEl.length ? addressEl.text().trim() || null : null;
    const location = locationTextEl.length ? locationTextEl.text().trim() || null : null;

    let title: string | null = null;
    const descLink = $card.find(DESCRIPTION_LINK_SELECTOR).first();
    if (descLink.length) {
      title = descLink.text().trim() || null;
    }

    let imageUrl: string | null = null;
    const img = $card.find(GALLERY_IMG_SELECTOR).first();
    if (img.length) {
      const src = img.attr('src') || img.attr('data-flickity-lazyload');
      if (src && !src.startsWith('data:')) imageUrl = src;
    }

    let developmentStage: string | null = null;
    let deliveryDate: string | null = null;
    const stageEl = $card.find(STAGE_SELECTOR).first();
    if (stageEl.length) {
      const full = stageEl.text().replace(/\s+/g, ' ').trim();
      const parts = full.split(' · ').map((p) => p.trim()).filter(Boolean);
      if (parts[0]) developmentStage = parts[0];
      if (parts[1] && parts[1].toLowerCase().startsWith('entrega ')) {
        deliveryDate = parts[1].replace(/^Entrega\s+/i, '').trim() || null;
      }
    }

    results.push({
      id,
      postingType,
      url,
      title,
      priceFormatted,
      price,
      location,
      address,
      features,
      imageUrl,
      developmentStage,
      deliveryDate,
    });
  });

  return results;
}

/**
 * Extract bedroom/area from feature strings like "2 dorm.", "64 m² tot."
 */
export function parseFeatures(features: string[]): {
  bedrooms: number | null;
  area: number | null;
} {
  let bedrooms: number | null = null;
  let area: number | null = null;
  for (const f of features) {
    const dormMatch = f.match(/(\d+)\s*dorm/i);
    if (dormMatch) bedrooms = parseInt(dormMatch[1], 10);
    const areaMatch = f.match(/(\d+)\s*m²/);
    if (areaMatch) area = parseInt(areaMatch[1], 10);
    if (!areaMatch && /(\d+)\s*a\s*(\d+)\s*m²/.test(f)) {
      const range = f.match(/(\d+)\s*a\s*(\d+)\s*m²/);
      if (range) area = Math.floor((parseInt(range[1], 10) + parseInt(range[2], 10)) / 2);
    }
  }
  return { bedrooms, area };
}
