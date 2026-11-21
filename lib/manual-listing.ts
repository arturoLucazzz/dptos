/**
 * Validation of a listing typed in by hand, and its conversion into the same
 * `ListingCard`s the scrapers produce, so it goes through the same ingest and dedupe.
 *
 * Numbers arrive as strings from a form. A plain decimal ("280000", "95.5") is
 * accepted; anything with thousands separators ("280,000") is rejected rather than
 * guessed at, because "1,500" is a price in one reading and a decimal in another.
 */

import { districtSlugFromName, LIMA_DISTRICT_NAMES } from '../scraper/src/config/districts';
import { emptyCard, type ListingCard } from './listing-card';

export const REQUIRED = 'Requerido';
export const POSITIVE = 'Debe ser un número mayor que 0';
export const BAD_DISTRICT = 'Distrito no válido';
export const NO_UNITS = 'Agrega al menos una unidad';
export const WHOLE = 'Debe ser un número entero, 0 o más';
export const NOT_A_NUMBER = 'Escribe solo números, ej. 280000';
export const NOT_A_DECIMAL = 'Escribe solo números, ej. 65.5';
export const TOO_BIG = 'Valor demasiado grande';

const MAX_PRICE = 1e10;
const MAX_AREA = 1e5;
const MAX_COUNT = 100;
const MAX_UNITS = 200;
const MAX_TEXT = 2000;
export const BAD_LINK = 'Debe ser un enlace http o https';
export const BAD_CHOICE = 'Opción no válida';

type Errors = Record<string, string>;
type Result =
  | { ok: true; districtSlug: string; operation: 'SALE' | 'RENT'; cards: ListingCard[] }
  | { ok: false; errors: Errors };

type Bag = Record<string, unknown>;

function asBag(value: unknown): Bag {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Bag) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

/** Only the known fields, as text, capped: the raw payload is what the owner typed, not whatever was posted. */
function pick(bag: Bag, keys: string[]): Bag {
  const out: Bag = {};
  for (const key of keys) {
    const value = text(bag[key]);
    if (value) out[key] = value.slice(0, MAX_TEXT);
  }
  return out;
}

const UNIT_KEYS = ['price', 'currency', 'bedrooms', 'area', 'bathrooms', 'parkingSpots', 'unitNumber'];
const SINGLE_KEYS = [...UNIT_KEYS, 'operation', 'district', 'link', 'address', 'buildingName', 'publisher', 'photoUrls', 'notes'];
const PROJECT_KEYS = ['name', 'district', 'developer', 'address', 'deliveryDate', 'stage', 'link', 'notes'];

function optionalText(value: unknown): string | null {
  return text(value) || null;
}

type NumberStyle = 'price' | 'decimal';

/**
 * A number typed by hand. Thousands in the Peruvian or English style ("280.000",
 * "280,000", "1 280 000") are a whole number, but only for prices: for an area,
 * "65.123" is ambiguous and is refused. A comma is a decimal separator when it is
 * not a thousands separator ("65,5"). Returns null when the text is not a number.
 */
function parseNumber(value: unknown, style: NumberStyle): number | null {
  const s = text(value);
  if (style === 'price' && /^\d{1,3}([.,' ]\d{3})+$/.test(s)) return Number(s.replace(/[.,' ]/g, ''));
  if (!/^\d+([.,]\d{1,2})?$/.test(s)) return null;
  return Number(s.replace(',', '.'));
}

function isNegative(s: string): boolean {
  return /^-\s*\d/.test(s);
}

function positive(bag: Bag, key: string, errors: Errors, prefix: string, style: NumberStyle, max: number): number | null {
  const s = text(bag[key]);
  if (!s) {
    errors[prefix + key] = REQUIRED;
    return null;
  }
  const n = parseNumber(s, style);
  if (n == null) {
    errors[prefix + key] = isNegative(s) ? POSITIVE : style === 'price' ? NOT_A_NUMBER : NOT_A_DECIMAL;
    return null;
  }
  if (n <= 0) {
    errors[prefix + key] = POSITIVE;
    return null;
  }
  if (n >= max) {
    errors[prefix + key] = TOO_BIG;
    return null;
  }
  return n;
}

function whole(bag: Bag, key: string, errors: Errors, prefix: string, required: boolean): number | null {
  const s = text(bag[key]);
  if (!s) {
    if (required) errors[prefix + key] = REQUIRED;
    return null;
  }
  if (!/^\d+$/.test(s)) {
    errors[prefix + key] = WHOLE;
    return null;
  }
  const n = Number(s);
  if (n >= MAX_COUNT) {
    errors[prefix + key] = TOO_BIG;
    return null;
  }
  return n;
}

function optionalLink(bag: Bag, key: string, errors: Errors, prefix: string): string {
  let s = text(bag[key]);
  if (!s) return '';
  if (/^www\./i.test(s)) s = `https://${s}`;
  try {
    const url = new URL(s);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
  } catch {
    // falls through to the error
  }
  errors[prefix + key] = BAD_LINK;
  return '';
}

function district(value: unknown, key: string, errors: Errors): string | null {
  const s = text(value);
  if (!s) {
    errors[key] = REQUIRED;
    return null;
  }
  const slug = districtSlugFromName(s);
  if (!slug) {
    errors[key] = BAD_DISTRICT;
    return null;
  }
  return slug;
}

/** Newline- or comma-separated http(s) URLs; anything else is dropped. */
export function parsePhotoUrls(value: unknown): string[] {
  const parts = Array.isArray(value) ? value.map(text) : text(value).split(/[\n,]+/);
  const urls: string[] = [];
  for (const part of parts) {
    const candidate = part.trim();
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !urls.includes(url.toString())) {
        urls.push(url.toString());
      }
    } catch {
      // not a URL: dropped
    }
  }
  return urls;
}

function currencyOf(bag: Bag, errors: Errors, prefix: string): 'PEN' | 'USD' | null {
  const s = text(bag.currency);
  if (!s) {
    errors[prefix + 'currency'] = REQUIRED;
    return null;
  }
  if (s !== 'PEN' && s !== 'USD') {
    errors[prefix + 'currency'] = BAD_CHOICE;
    return null;
  }
  return s;
}

interface Pricing {
  price: number;
  currency: 'PEN' | 'USD';
  bedrooms: number;
  area: number;
  bathrooms: number | null;
  parkingSpots: number | null;
}

/** The fields a unit has in both modes. Returns null when any of them is invalid. */
function readUnitFields(bag: Bag, errors: Errors, prefix: string): Pricing | null {
  const before = Object.keys(errors).length;
  const price = positive(bag, 'price', errors, prefix, 'price', MAX_PRICE);
  const currency = currencyOf(bag, errors, prefix);
  const bedrooms = whole(bag, 'bedrooms', errors, prefix, true);
  const area = positive(bag, 'area', errors, prefix, 'decimal', MAX_AREA);
  const bathrooms = whole(bag, 'bathrooms', errors, prefix, false);
  const parkingSpots = whole(bag, 'parkingSpots', errors, prefix, false);
  if (Object.keys(errors).length > before) return null;
  return { price: price!, currency: currency!, bedrooms: bedrooms!, area: area!, bathrooms, parkingSpots };
}

function unitCard(fields: Pricing, over: Partial<ListingCard>): ListingCard {
  return emptyCard('manual', {
    kind: 'UNIT',
    priceAmount: fields.price,
    priceCurrency: fields.currency,
    bedrooms: fields.bedrooms,
    bathrooms: fields.bathrooms,
    parkingSpots: fields.parkingSpots,
    areaTotal: fields.area,
    ...over,
  });
}

function validateUnit(bag: Bag, newId: () => string): Result {
  const errors: Errors = {};
  const fields = readUnitFields(bag, errors, '');
  const operationText = text(bag.operation);
  const operation = operationText === 'SALE' || operationText === 'RENT' ? operationText : null;
  if (!operationText) errors.operation = REQUIRED;
  else if (!operation) errors.operation = BAD_CHOICE;
  const districtSlug = district(bag.district, 'district', errors);
  const url = optionalLink(bag, 'link', errors, '');
  if (!fields || !operation || !districtSlug || Object.keys(errors).length > 0) return { ok: false, errors };

  const photoUrls = parsePhotoUrls(bag.photoUrls);
  const card = unitCard(fields, {
    sourcePostingId: `m-${newId()}`,
    operation,
    url,
    districtSlug,
    districtName: LIMA_DISTRICT_NAMES[districtSlug] ?? null,
    address: optionalText(bag.address),
    buildingName: optionalText(bag.buildingName),
    unitNumber: optionalText(bag.unitNumber),
    publisherName: optionalText(bag.publisher),
    description: optionalText(bag.notes),
    imageUrls: photoUrls,
    imageUrl: photoUrls[0] ?? null,
    raw: pick(bag, SINGLE_KEYS),
  });
  return { ok: true, districtSlug, operation, cards: [card] };
}

function validateProject(bag: Bag, newId: () => string): Result {
  const errors: Errors = {};
  const project = asBag(bag.project);
  const name = text(project.name);
  if (!name) errors['project.name'] = REQUIRED;
  const districtSlug = district(project.district, 'project.district', errors);
  const url = optionalLink(project, 'link', errors, 'project.');

  // Rows with every field blank are skipped, but keep their index so error keys match the form.
  const rawUnits = Array.isArray(bag.units) ? Array.from(bag.units.slice(0, MAX_UNITS), asBag) : [];
  const filled = rawUnits.map((unit) => Object.values(unit).some((v) => text(v) !== ''));
  const units: { fields: Pricing; unitNumber: string | null; raw: Bag }[] = [];
  if (!filled.some(Boolean)) errors.units = NO_UNITS;
  rawUnits.forEach((unit, i) => {
    if (!filled[i]) return;
    const fields = readUnitFields(unit, errors, `units.${i}.`);
    if (fields) units.push({ fields, unitNumber: optionalText(unit.unitNumber), raw: unit });
  });
  if (Object.keys(errors).length > 0 || !districtSlug) return { ok: false, errors };

  const projectId = `m-${newId()}`;
  const common = {
    districtSlug,
    districtName: LIMA_DISTRICT_NAMES[districtSlug] ?? null,
    operation: 'SALE' as const,
    address: optionalText(project.address),
    developerName: optionalText(project.developer),
  };
  const projectCard = emptyCard('manual', {
    ...common,
    kind: 'PROJECT',
    sourcePostingId: projectId,
    url,
    title: name,
    buildingName: name,
    description: optionalText(project.notes),
    developmentStage: optionalText(project.stage),
    deliveryDate: optionalText(project.deliveryDate),
    unitsCount: units.length,
    raw: pick(project, PROJECT_KEYS),
  });
  const unitCards = units.map(({ fields, unitNumber, raw }) =>
    unitCard(fields, {
      ...common,
      sourcePostingId: `m-${newId()}`,
      projectSourceId: projectId,
      url,
      title: name,
      buildingName: name,
      unitNumber,
      developmentStage: projectCard.developmentStage,
      deliveryDate: projectCard.deliveryDate,
      raw: pick(raw, UNIT_KEYS),
    })
  );
  return { ok: true, districtSlug, operation: 'SALE', cards: [projectCard, ...unitCards] };
}

/** Project mode when the entry has a `project`, unit mode otherwise. */
export function validateManualListing(raw: unknown, newId: () => string): Result {
  const bag = asBag(raw);
  return bag.project !== undefined || bag.mode === 'project' ? validateProject(bag, newId) : validateUnit(bag, newId);
}
