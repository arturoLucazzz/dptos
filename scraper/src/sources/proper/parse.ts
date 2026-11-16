/**
 * Proper's JSON into cards: one PROJECT card per project and one UNIT card per
 * apartment, so each unit ranks at its own price.
 *
 * Proper's own expected rent, ROI and TIR per unit are the source's estimate,
 * not an observed rent. They stay in `raw` and feed nothing else.
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

/** A price in the currency Proper quotes the unit in. Zero means absent. */
function price(moneda: unknown, pen: unknown, usd: unknown): { amount: number | null; currency: 'PEN' | 'USD' | null } {
  const isUsd = typeof moneda === 'string' && moneda.toLowerCase() === 'usd';
  const amount = num(isUsd ? usd : pen);
  if (amount == null || amount <= 0) return { amount: null, currency: null };
  return { amount, currency: isUsd ? 'USD' : 'PEN' };
}

/**
 * Cards of one project from its `/_next/data` answer: the project first, then
 * its units. Throws when the answer holds no project, so the caller can count
 * the fetch as failed instead of the project as empty.
 */
export function parseProperProject(json: unknown, slug: string): ListingCard[] {
  const props = isRecord(json) && isRecord(json.pageProps) ? json.pageProps.props : null;
  const proyecto = isRecord(props) && isRecord(props.proyecto) ? props.proyecto : null;
  if (!isRecord(props) || !proyecto) throw new Error(`Proper project ${slug}: no proyecto in the answer`);

  const name = str(proyecto.nombre);
  const districtName = str(proyecto.distrito);
  const districtSlug = districtSlugFromName(districtName);
  const url = properProjectUrl(slug);
  const units = Array.isArray(props.departamentos) ? props.departamentos.filter(isRecord) : [];
  const unitMoneda = units[0]?.tipo_moneda;
  const from = price(unitMoneda ?? proyecto.tipo_moneda, proyecto.precio_desde, proyecto.precio_desde_dolar);
  const images = isRecord(props.imagenes) ? Object.values(props.imagenes).flat().filter((v): v is string => typeof v === 'string') : [];

  const shared = { buildingName: name, districtName, districtSlug, url };

  const project = emptyCard('proper', {
    ...shared,
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
  });

  const unitCards = units.map((unit) => {
    const unitPrice = price(unit.tipo_moneda, unit.precio, unit.precio_dolar);
    const id = String(unit.id);
    return emptyCard('proper', {
      ...shared,
      kind: 'UNIT',
      sourcePostingId: `${slug}-${id}`,
      projectSourceId: slug,
      operation: 'SALE',
      unitNumber: str(unit.nro_depa) ?? (typeof unit.nro_depa === 'number' ? String(unit.nro_depa) : null),
      priceAmount: unitPrice.amount,
      priceCurrency: unitPrice.currency,
      areaTotal: num(unit.unit_area),
      bedrooms: num(unit.nro_dormitorios),
      bathrooms: num(unit.nro_banos),
      developmentStage: project.developmentStage,
      deliveryDate: project.deliveryDate,
      latitude: project.latitude,
      longitude: project.longitude,
      raw: unit,
    });
  });

  return [project, ...unitCards];
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
  const unitPrice = price(unit.moneda ?? (num(unit.precio_dolar) ? 'usd' : 'pen'), unit.precio, unit.precio_dolar);
  const images = isRecord(props.imagenes) ? Object.values(props.imagenes).flat().filter((v): v is string => typeof v === 'string') : [];
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
