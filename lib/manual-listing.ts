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

function optionalText(value: unknown): string | null {
  return text(value) || null;
}

/** A plain non-negative decimal, or null when the text is anything else. */
function parseNumber(value: unknown): number | null {
  const s = text(value);
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function positive(bag: Bag, key: string, errors: Errors, prefix: string): number | null {
  const s = text(bag[key]);
  if (!s) {
    errors[prefix + key] = REQUIRED;
    return null;
  }
  const n = parseNumber(s);
  if (n == null || n <= 0) {
    errors[prefix + key] = POSITIVE;
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
  const n = parseNumber(s);
  if (n == null || !Number.isInteger(n)) {
    errors[prefix + key] = WHOLE;
    return null;
  }
  return n;
}

function optionalLink(bag: Bag, key: string, errors: Errors, prefix: string): string {
  const s = text(bag[key]);
  if (!s) return '';
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
  const price = positive(bag, 'price', errors, prefix);
  const currency = currencyOf(bag, errors, prefix);
  const bedrooms = whole(bag, 'bedrooms', errors, prefix, true);
  const area = positive(bag, 'area', errors, prefix);
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
    raw: bag,
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

  const rawUnits = Array.isArray(bag.units) ? bag.units.map(asBag) : [];
  const units: { fields: Pricing; unitNumber: string | null }[] = [];
  if (rawUnits.length === 0) errors.units = NO_UNITS;
  rawUnits.forEach((unit, i) => {
    const fields = readUnitFields(unit, errors, `units.${i}.`);
    if (fields) units.push({ fields, unitNumber: optionalText(unit.unitNumber) });
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
    raw: project,
  });
  const unitCards = units.map(({ fields, unitNumber }, i) =>
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
      raw: rawUnits[i],
    })
  );
  return { ok: true, districtSlug, operation: 'SALE', cards: [projectCard, ...unitCards] };
}

/** Project mode when the entry has a `project`, unit mode otherwise. */
export function validateManualListing(raw: unknown, newId: () => string): Result {
  const bag = asBag(raw);
  return bag.project !== undefined || bag.mode === 'project' ? validateProject(bag, newId) : validateUnit(bag, newId);
}

/**
 * Form fields to the shape `validateManualListing` reads: `project.name` goes under
 * `project`, `units.2.price` under `units[2]`, everything else stays flat.
 */
export function rawFromFormEntries(entries: Iterable<[string, unknown]>): Bag {
  const raw: Bag = {};
  const project: Bag = {};
  const units: Bag[] = [];
  for (const [key, value] of entries) {
    if (typeof value !== 'string') continue;
    const unitMatch = /^units\.(\d+)\.(\w+)$/.exec(key);
    if (unitMatch) {
      const index = Number(unitMatch[1]);
      units[index] = { ...units[index], [unitMatch[2]]: value };
    } else if (key.startsWith('project.')) {
      project[key.slice('project.'.length)] = value;
    } else {
      raw[key] = value;
    }
  }
  if (raw.mode === 'project') {
    raw.project = project;
    raw.units = units.filter(Boolean);
  }
  return raw;
}
