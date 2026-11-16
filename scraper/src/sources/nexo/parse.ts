/**
 * Nexo's project list pages into PROJECT cards.
 *
 * Each list page embeds the whole page's projects as a JSON array (`const projects`)
 * next to a schema.org ItemList that holds only name, brand, price and URL, so the
 * embedded array is the one source of address, area, bedrooms and stage. Nexo lists
 * projects only here: no unit prices are read. The photo paths are relative to a CDN
 * host that the page does not name, so no image is kept.
 */

import { emptyCard, type ListingCard } from '@/lib/listing-card';
import type { Currency } from '../../scrapers/urbania/types';
import { districtSlugFromName } from '../../config/districts';

export const NEXO_BASE_URL = 'https://nexoinmobiliario.pe';
export const NEXO_LIST_URL = `${NEXO_BASE_URL}/departamentos`;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
/** Nexo sends numbers as strings ("54.00"). */
const num = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** "etapa" codes on the list: 1 en planos, 2 en construcción, 3 entrega inmediata. */
const STAGES: Record<string, string> = { '1': 'En planos', '2': 'En construcción', '3': 'Entrega inmediata' };

function currencyOf(coin: unknown): Currency | null {
  const symbol = typeof coin === 'string' ? coin.replace(/[\s.]/g, '').toUpperCase() : '';
  if (symbol === 'S/') return 'PEN';
  if (symbol === '$' || symbol === 'US$' || symbol === 'USD') return 'USD';
  return null;
}

/** The project array embedded in the page; throws when it is missing, so a changed page is not read as empty. */
function embeddedProjects(html: string): Json[] {
  const start = html.indexOf('const projects = [');
  const end = start < 0 ? -1 : html.indexOf('];', start);
  if (end < 0) throw new Error('Nexo: no embedded projects array');
  const json: unknown = JSON.parse(html.slice(start + 'const projects = '.length, end + 1));
  if (!Array.isArray(json)) throw new Error('Nexo: embedded projects is not an array');
  return json.filter(isRecord);
}

function cardOf(project: Json): ListingCard | null {
  const slug = str(project.slug);
  const fullSlug = str(project.full_slug);
  if (!slug || !fullSlug) return null;
  const districtName = str(project.distrito);
  const currency = currencyOf(project.coin);
  const amount = num(project.min_price);
  const known = currency !== null && amount !== null && amount > 0;
  const phase = str(project.project_phase);

  return emptyCard('nexo', {
    kind: 'PROJECT',
    operation: 'SALE',
    sourcePostingId: slug,
    url: `${NEXO_BASE_URL}/${fullSlug}`,
    buildingName: str(project.name),
    developerName: str(project.builder_name),
    address: str(project.direccion),
    districtName,
    districtSlug: districtSlugFromName(districtName),
    priceAmount: known ? amount : null,
    priceCurrency: known ? currency : null,
    priceIsFrom: true,
    areaMin: num(project.area_min),
    areaMax: num(project.area_max),
    bedroomsMin: num(project.room_min),
    bedroomsMax: num(project.room_max),
    unitsCount: num(project.cantidad),
    developmentStage: phase ? (STAGES[phase] ?? null) : null,
    // The Nexo `coord_lat` and `long` are strings of the project's own coordinates.
    latitude: num(project.coord_lat),
    longitude: num(project.long),
    raw: project,
  });
}

export interface NexoListPage {
  cards: ListingCard[];
  nextPageUrl: string | null;
  /** What the site says it lists in all. */
  totalProjects: number;
  /** Pages the site says it has. */
  totalPages: number;
  /** Projects on the page that carried no slug and so became no card. */
  droppedWithoutSlug: number;
}

/**
 * Cards of one list page, and the URL of the next page (null on the last one).
 * Throws when the page has no embedded project array or no paging markers, so a
 * changed page is never read as a single, complete page.
 */
export function parseNexoListPage(html: string): NexoListPage {
  const projects = embeddedProjects(html);
  const cards = projects.flatMap((project) => cardOf(project) ?? []);

  const total = Number(html.match(/const totalProyectos = (\d+);/)?.[1]);
  const perPage = Number(html.match(/const itemsPerPage = (\d+);/)?.[1]);
  const current = Number(html.match(/let currentPage = (\d+);/)?.[1]);
  if (![total, perPage, current].every(Number.isFinite) || perPage <= 0) throw new Error('Nexo: no paging markers');
  const totalPages = Math.ceil(total / perPage);
  return {
    cards,
    nextPageUrl: current < totalPages ? `${NEXO_LIST_URL}?page=${current + 1}` : null,
    totalProjects: total,
    totalPages,
    droppedWithoutSlug: projects.length - cards.length,
  };
}
