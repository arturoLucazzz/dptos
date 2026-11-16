/**
 * Talk to Navent's search API, which Urbania and Adondevivir share.
 *
 * The search page calls `POST /rplis-api/postings` with a JSON body and gets the
 * results back as the same object it embeds as `__PRELOADED_STATE__.listStore`.
 * Captured bodies are in `__fixtures__/*.request.json`. The fields that matter:
 *
 * - `zone`: the district, as the site's own location id. The ids differ per site
 *   (Lince is "51119493" on Urbania and "119493" on Adondevivir), so they are
 *   read off the district's search page instead of being kept in a table.
 * - `pagina`: the page, starting at 1. Pages hold 30 postings.
 * - `tipoDeOperacion`: the operation, "1" for sale and "2" for rent.
 * - `tipoDePropiedad`: the property type, "2" for apartments.
 * - `sort`: "low_price", not the page's default "relevance". Relevance reorders
 *   between requests: paging Lince by relevance gave 279 distinct postings out of
 *   303, by price 302 out of 302.
 *
 * Every other field is sent as the site sends it with no filter applied.
 */

import { Operation } from '@/lib/generated/prisma/enums';
import { districtSlugFromName } from '../../config/districts';
import { buildUrbaniaSearchUrl } from '../../scrapers/urbania/build-search-url';
import { extractPreloadedListStore } from '../../scrapers/urbania/parse-preloaded-state';
import type { BrowserSession } from '../../utils/browser-fetch';

export type NaventSite = 'urbania' | 'adondevivir';

export const NAVENT_BASE_URL: Record<NaventSite, string> = {
  urbania: 'https://urbania.pe',
  adondevivir: 'https://www.adondevivir.com',
};

const OPERATION_ID: Record<Operation, string> = {
  [Operation.SALE]: '1',
  [Operation.RENT]: '2',
};

const APARTMENT_TYPE_ID = '2';

/** The district's search page, which is also where its zone id is read from. */
export function naventSearchUrl(site: NaventSite, districtSlug: string, operation: Operation): string {
  if (site === 'urbania') {
    return buildUrbaniaSearchUrl({
      propertyType: 'apartment',
      operationType: operation === Operation.RENT ? 'rent' : 'sale',
      district: districtSlug,
      city: 'Lima',
    });
  }
  const verb = operation === Operation.RENT ? 'alquiler' : 'venta';
  return `${NAVENT_BASE_URL.adondevivir}/departamentos-en-${verb}-en-${districtSlug}.html`;
}

interface AppliedFilter {
  type?: string;
  options?: Array<{ label?: string; type?: string; min?: string }>;
}

/**
 * The zone id a search page applied, if it is the district asked for. A slug the
 * site does not know sends it to a broader search (all of Peru on Adondevivir),
 * which has no zone, or a different one, and must not be crawled as the district.
 */
export function zoneFromSearchPage(html: string, districtSlug: string): string | null {
  const store = extractPreloadedListStore(html) as { appliedFilters?: AppliedFilter[] } | null;
  const location = store?.appliedFilters?.find((filter) => filter.type === 'location');
  const zone = location?.options?.find((option) => option.type === 'zone');
  if (!zone?.min || districtSlugFromName(zone.label) !== districtSlug) return null;
  return zone.min;
}

export function postingsRequestBody(zone: string, operation: Operation, page: number): Record<string, unknown> {
  return {
    q: null,
    direccion: null,
    moneda: '',
    preciomin: null,
    preciomax: null,
    services: '',
    general: '',
    searchbykeyword: '',
    amenidades: '',
    caracteristicasprop: null,
    comodidades: '',
    disposicion: null,
    roomType: '',
    outside: '',
    areaPrivativa: '',
    areaComun: '',
    multipleRets: '',
    tipoDePropiedad: APARTMENT_TYPE_ID,
    subtipoDePropiedad: null,
    tipoDeOperacion: OPERATION_ID[operation],
    garages: null,
    antiguedad: null,
    expensasminimo: null,
    expensasmaximo: null,
    withoutguarantor: null,
    habitacionesminimo: 0,
    habitacionesmaximo: 0,
    ambientesminimo: 0,
    ambientesmaximo: 0,
    banos: null,
    superficieCubierta: 1,
    idunidaddemedida: 1,
    metroscuadradomin: null,
    metroscuadradomax: null,
    tipoAnunciante: 'ALL',
    grupoTipoDeMultimedia: '',
    publicacion: null,
    sort: 'low_price',
    etapaDeDesarrollo: '',
    auctions: null,
    polygonApplied: null,
    idInmobiliaria: null,
    excludePostingContacted: '',
    banks: '',
    places: '',
    condominio: '',
    preTipoDeOperacion: '',
    pagina: page,
    city: null,
    province: null,
    zone,
    valueZone: null,
    subZone: null,
    coordenates: null,
  };
}

export function fetchPostingsPage(
  session: BrowserSession,
  site: NaventSite,
  zone: string,
  operation: Operation,
  page: number
): Promise<unknown> {
  return session.postJson(`${NAVENT_BASE_URL[site]}/rplis-api/postings`, postingsRequestBody(zone, operation, page));
}
