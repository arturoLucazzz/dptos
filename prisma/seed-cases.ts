/**
 * Investor cases for the seed: one small, named situation per decision an investor
 * makes on the platform. The market seed gives the charts a known price surface;
 * these give each screen a row you can open and check by name.
 *
 * Pure on purpose. The seed ingests them, and the test checks that each case still
 * means what its title says under the default assumptions with S/ 80k cash.
 */

import { Operation } from '../lib/generated/prisma/enums';
import { emptyCard, type ListingCard, type SourceId } from '../lib/listing-card';
import { DISTRICTS } from './seed-districts';

export interface InvestorCase {
  id: string;
  /** Spanish, shown in the checklist. */
  title: string;
  /** The screen where the case shows. */
  screen: string;
  /** Spanish: what the owner sees on that screen. */
  lookFor: string;
  /** One or more sources. */
  cards: ListingCard[];
  /** Input for the manual ingest, when the case is a manual entry. */
  manual?: unknown;
  /** Prices from oldest to newest, one per weekly run. The last one is the card's price. */
  priceHistory?: number[];
}

interface UnitSpec {
  source: SourceId;
  id: string;
  district: string;
  pricePen: number;
  areaM2: number;
  bedrooms: number;
  maintenancePen: number | null;
  address: string;
  buildingName?: string;
  unitNumber?: string;
  publisherName?: string;
  raw?: unknown;
}

function districtOf(slug: string) {
  const district = DISTRICTS.find((d) => d.slug === slug);
  if (!district) throw new Error(`Unknown seed district: ${slug}`);
  return district;
}

function unit(spec: UnitSpec): ListingCard {
  const district = districtOf(spec.district);
  const sourcePostingId = `caso-${spec.id}-${spec.source}`;
  return emptyCard(spec.source, {
    sourcePostingId,
    kind: 'UNIT',
    operation: Operation.SALE,
    postingType: 'PROPERTY',
    realEstateType: 'Departamentos',
    url: `https://example.invalid/${spec.source}/${sourcePostingId}`,
    title: `Departamento en ${district.name}`,
    priceAmount: spec.pricePen,
    priceCurrency: 'PEN',
    pricePenShown: spec.pricePen,
    priceFormatted: `S/ ${spec.pricePen}`,
    maintenanceAmount: spec.maintenancePen,
    maintenanceCurrency: spec.maintenancePen == null ? null : 'PEN',
    areaTotal: spec.areaM2,
    areaCovered: Math.round(spec.areaM2 * 0.92),
    bedrooms: spec.bedrooms,
    bathrooms: Math.max(1, spec.bedrooms - 1),
    parkingSpots: 1,
    antiquityYears: 8,
    address: spec.address,
    districtName: district.name,
    districtSlug: district.slug,
    cityName: 'Lima',
    latitude: district.lat,
    longitude: district.lon,
    publisherId: `caso-${spec.id}`,
    publisherName: spec.publisherName ?? 'Inmobiliaria Caso',
    buildingName: spec.buildingName ?? null,
    unitNumber: spec.unitNumber ?? null,
    status: 'ONLINE',
    raw: spec.raw ?? { seedCase: spec.id },
  });
}

export function buildInvestorCases(): InvestorCase[] {
  const sameApartment = {
    id: 'copia-mas-barata',
    district: 'miraflores',
    areaM2: 78,
    bedrooms: 2,
    maintenancePen: 320,
    address: 'Av. José Larco 1150',
    buildingName: 'Edificio Larco 1150',
    unitNumber: '802',
  };

  const hurriedPrices = [560_000, 535_000, 515_000, 495_000];

  return [
    {
      id: 'ganga-lince',
      title: 'Ganga en Lince',
      screen: '/departamentos',
      lookFor:
        'Con efectivo S/ 200,000: "Ganas S/ …/mes" en verde y un % al año sobre tu efectivo. Unos 28% bajo el precio justo. Con S/ 80,000 pasa a "Pones": el efectivo cambia la respuesta.',
      cards: [
        unit({
          source: 'urbania',
          id: 'ganga-lince',
          district: 'lince',
          pricePen: 330_000,
          areaM2: 62,
          bedrooms: 1,
          maintenancePen: 150,
          address: 'Jr. Manuel Candamo 455',
        }),
      ],
    },
    {
      id: 'trampa-barata',
      title: 'Barato por m², pero pierde plata',
      screen: '/departamentos',
      lookFor:
        'Precio por m² bajo para San Miguel, pero "Pones S/ …/mes" en rojo: mantenimiento alto y alquiler bajo.',
      cards: [
        unit({
          source: 'adondevivir',
          id: 'trampa-barata',
          district: 'san-miguel',
          pricePen: 430_000,
          areaM2: 95,
          bedrooms: 2,
          maintenancePen: 950,
          address: 'Av. La Marina 2345',
        }),
      ],
    },
    {
      id: 'copia-mas-barata',
      title: 'El mismo depa, más barato en otra fuente',
      screen: '/departamentos',
      lookFor:
        'Una sola fila con "3 fuentes · S/ 580k a S/ 600k". El precio oficial es el de Proper, S/ 580,000: tu ancla para negociar.',
      cards: [
        unit({ ...sameApartment, source: 'urbania', pricePen: 600_000 }),
        unit({ ...sameApartment, source: 'adondevivir', pricePen: 595_000 }),
        unit({ ...sameApartment, source: 'proper', pricePen: 580_000, publisherName: 'Proper' }),
      ],
    },
    {
      id: 'vendedor-apurado',
      title: 'Vendedor que baja y baja el precio',
      screen: '/departamentos',
      lookFor:
        'Tres rebajas seguidas, de S/ 560,000 a S/ 495,000. Puntaje de rebaja alto: hay espacio para negociar.',
      priceHistory: hurriedPrices,
      cards: [
        unit({
          source: 'urbania',
          id: 'vendedor-apurado',
          district: 'lince',
          pricePen: hurriedPrices.at(-1)!,
          areaM2: 80,
          bedrooms: 2,
          maintenancePen: 280,
          address: 'Av. Petit Thouars 2890',
        }),
      ],
    },
    {
      id: 'proper-roi-distinto',
      title: 'Proper dice 6.9%, nuestros números dicen otra cosa',
      screen: '/departamentos',
      lookFor:
        'Unidad de Proper en Surquillo. Proper publica "Rent. anual 6.9%" y "TIR 17.6%". Aquí ves cuánto ganas o pones cada mes de verdad.',
      cards: [
        unit({
          source: 'proper',
          id: 'proper-roi-distinto',
          district: 'surquillo',
          pricePen: 420_000,
          areaM2: 65,
          bedrooms: 2,
          maintenancePen: 260,
          address: 'Calle Dante 870',
          buildingName: 'Proper Dante',
          unitNumber: '504',
          publisherName: 'Proper',
          raw: { seedCase: 'proper-roi-distinto', renta_estimada: 2_300, rentabilidad_anual: 6.9, tir_anual: 17.6 },
        }),
      ],
    },
    {
      id: 'en-planos',
      title: 'Proyecto en planos, solo precio "desde"',
      screen: '/estadisticas',
      lookFor:
        'En "Proyectos por etapa", Miraflores cuenta 1 proyecto "En planos" (Residencial Pardo, entrega 2027). No entra al ranking de /departamentos.',
      cards: [
        emptyCard('nexo', {
          sourcePostingId: 'caso-en-planos-nexo',
          kind: 'PROJECT',
          operation: Operation.SALE,
          url: 'https://example.invalid/nexo/caso-en-planos',
          title: 'Residencial Pardo',
          priceAmount: 350_000,
          priceCurrency: 'PEN',
          priceIsFrom: true,
          pricePenShown: 350_000,
          areaMin: 45,
          areaMax: 110,
          bedroomsMin: 1,
          bedroomsMax: 3,
          developmentStage: 'EN_PLANOS',
          deliveryDate: '2027-06',
          address: 'Av. José Pardo 640',
          districtName: districtOf('miraflores').name,
          districtSlug: 'miraflores',
          cityName: 'Lima',
          latitude: districtOf('miraflores').lat,
          longitude: districtOf('miraflores').lon,
          buildingName: 'Residencial Pardo',
          developerName: 'Constructora Caso',
          projectSourceId: 'caso-en-planos',
          raw: { seedCase: 'en-planos' },
        }),
      ],
    },
    {
      id: 'aviso-facebook',
      title: 'Aviso de Facebook, agregado a mano',
      screen: '/departamentos',
      lookFor: 'Fuente "Manual", sin enlace. Sigue vivo hasta que lo marques como vendido o retirado.',
      cards: [],
      manual: {
        operation: 'SALE',
        district: 'lince',
        price: '365000',
        currency: 'PEN',
        bedrooms: '2',
        area: '70',
        address: 'Av. Arenales 2500',
        publisher: 'Dueño directo',
        notes: 'Visto en Facebook Marketplace',
      },
    },
    {
      id: 'pierde-plata',
      title: 'Nunca se paga solo',
      screen: '/departamentos',
      lookFor:
        '"Pones S/ …/mes" en rojo y un "Total que pones" muy alto: el alquiler no alcanza a la cuota en todo el plazo.',
      cards: [
        unit({
          source: 'urbania',
          id: 'pierde-plata',
          district: 'san-isidro',
          pricePen: 1_450_000,
          areaM2: 140,
          bedrooms: 3,
          maintenancePen: 800,
          address: 'Av. Camino Real 1020',
        }),
      ],
    },
  ];
}
