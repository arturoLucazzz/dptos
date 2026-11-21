/**
 * Proper's JSON into cards: one PROJECT card per project, and one UNIT card per
 * apartment for immediate delivery.
 *
 * Proper's own expected rent and ROI are the source's estimate, not an observed
 * rent. They stay in `raw` and feed nothing else.
 */

import { districtSlugFromName } from '../../config/districts';
import { emptyCard, type ListingCard } from '@/lib/listing-card';

export const PROPER_BASE_URL = 'https://inversiones.proper.com.pe';

export function properProjectUrl(slug: string): string {
  return `${PROPER_BASE_URL}/proyecto/${slug}`;
}

export function properImmediateUrl(slug: string): string {
  return `${PROPER_BASE_URL}/entrega-inmediata/${slug}`;
}

/** The Next.js build id, which names the `/_next/data/<id>/...` JSON files. */
export function parseProperBuildId(html: string): string | null {
  const script = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!script) return null;
  try {
    const buildId = (JSON.parse(script[1]) as { buildId?: unknown }).buildId;
    return typeof buildId === 'string' && buildId ? buildId : null;
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every image URL in the `imagenes` object, whatever group it sits in. */
function imageUrlsOf(imagenes: unknown): string[] {
  if (!isRecord(imagenes)) return [];
  return Object.values(imagenes).flat().filter((v): v is string => typeof v === 'string');
}

/** A price in the currency Proper quotes the unit in. Zero means absent. */
function price(moneda: unknown, pen: unknown, usd: unknown): { amount: number | null; currency: 'PEN' | 'USD' | null } {
  const code = typeof moneda === 'string' ? moneda.toLowerCase() : null;
  // Any currency other than pen or usd is unknown: no price, rather than a guess.
  if (code !== 'pen' && code !== 'usd') return { amount: null, currency: null };
  const amount = num(code === 'usd' ? usd : pen);
  if (amount == null || amount <= 0) return { amount: null, currency: null };
  return { amount, currency: code === 'usd' ? 'USD' : 'PEN' };
}

/**
 * The PROJECT card from a `proyecto_profile/<slug>/` answer (`{proyecto}`).
 * Proper no longer publishes per-unit prices, so a project is one card. The
 * profile has no currency: the list's `tipo_moneda` says it, "pen" when absent.
 * Throws when the answer holds no project, so the caller counts a failed fetch.
 */
export function parseProperProfile(json: unknown, slug: string, images: string[], moneda?: string | null): ListingCard[] {
  const proyecto = isRecord(json) && isRecord(json.proyecto) ? json.proyecto : null;
  if (!proyecto) throw new Error(`Proper project ${slug}: no proyecto in the answer`);

  const name = str(proyecto.nombre);
  const districtName = str(proyecto.distrito);
  const from = price(moneda ?? 'pen', proyecto.precio_desde, proyecto.precio_desde);

  return [
    emptyCard('proper', {
      buildingName: name,
      districtName,
      districtSlug: districtSlugFromName(districtName),
      url: properProjectUrl(slug),
      kind: 'PROJECT',
      sourcePostingId: slug,
      operation: 'SALE',
      priceAmount: from.amount,
      priceCurrency: from.currency,
      priceIsFrom: true,
      areaMin: num(proyecto.area_desde),
      areaMax: num(proyecto.area_hasta),
      bedroomsMin: num(proyecto.dorms_desde),
      bedroomsMax: num(proyecto.dorms_hasta),
      unitsCount: num(proyecto.nro_dptos),
      developmentStage: str(proyecto.etapa),
      deliveryDate: str(proyecto.fecha_entrega),
      // coordenada_A is the latitude (about -12 in Lima), coordenada_B the longitude.
      latitude: num(proyecto.coordenada_A),
      longitude: num(proyecto.coordenada_B),
      imageUrls: images,
      imageUrl: images[0] ?? null,
      raw: proyecto,
    }),
  ];
}

/**
 * A single apartment for immediate delivery (`/entrega-inmediata/<slug>`), most
 * of them sold with a tenant. It has no project, so it is one UNIT card on its
 * own, keyed by its slug.
 */
export function parseProperImmediate(json: unknown, slug: string): ListingCard[] {
  const found = isRecord(json) && isRecord(json.pageProps) ? json.pageProps.props : null;
  const props = isRecord(found) ? found : null;
  const unit = props && isRecord(props.departamento) ? props.departamento : null;
  if (!props || !unit) throw new Error(`Proper unit ${slug}: no departamento in the answer`);

  const districtName = str(unit.distrito);
  const unitPrice = price(unit.tipo_moneda ?? (num(unit.precio_dolar) ? 'usd' : 'pen'), unit.precio, unit.precio_dolar);
  const images = imageUrlsOf(props.imagenes);
  const facade = str(unit.url_fachada);

  return [
    emptyCard('proper', {
      kind: 'UNIT',
      sourcePostingId: slug,
      operation: 'SALE',
      url: properImmediateUrl(slug),
      buildingName: str(unit.edificio),
      title: str(unit.nombre),
      districtName,
      districtSlug: districtSlugFromName(districtName),
      priceAmount: unitPrice.amount,
      priceCurrency: unitPrice.currency,
      areaTotal: num(unit.unit_area),
      bedrooms: num(unit.nro_dormitorios),
      bathrooms: num(unit.nro_banos),
      developmentStage: str(unit.etapa),
      latitude: num(unit.coordenada_A),
      longitude: num(unit.coordenada_B),
      imageUrls: facade ? [facade, ...images] : images,
      imageUrl: facade ?? images[0] ?? null,
      raw: unit,
    }),
  ];
}
