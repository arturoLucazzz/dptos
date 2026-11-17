/**
 * The seeded market's districts. Shared by the market seed and the investor cases,
 * so a case's expected rent comes from the same numbers as the market around it.
 */

/** The known market. Every price in the seed derives from these numbers. */
export const DISTRICTS = [
  { slug: 'lince', name: 'Lince', salePerM2: 7_400, rentPerM2: 35, lat: -12.0865, lon: -77.0365 },
  { slug: 'jesus-maria', name: 'Jesús María', salePerM2: 7_000, rentPerM2: 32, lat: -12.0742, lon: -77.0489 },
  { slug: 'san-isidro', name: 'San Isidro', salePerM2: 9_200, rentPerM2: 38, lat: -12.0970, lon: -77.0360 },
  { slug: 'pueblo-libre', name: 'Pueblo Libre', salePerM2: 6_500, rentPerM2: 28, lat: -12.0760, lon: -77.0620 },
  { slug: 'magdalena', name: 'Magdalena', salePerM2: 6_750, rentPerM2: 30, lat: -12.0920, lon: -77.0700 },
  { slug: 'surquillo', name: 'Surquillo', salePerM2: 7_100, rentPerM2: 35, lat: -12.1122, lon: -77.0175 },
  { slug: 'miraflores', name: 'Miraflores', salePerM2: 8_700, rentPerM2: 36, lat: -12.1211, lon: -77.0296 },
  { slug: 'san-borja', name: 'San Borja', salePerM2: 7_350, rentPerM2: 27, lat: -12.1080, lon: -76.9980 },
  { slug: 'santiago-de-surco', name: 'Santiago de Surco', salePerM2: 6_800, rentPerM2: 27, lat: -12.1350, lon: -76.9930 },
  { slug: 'san-miguel', name: 'San Miguel', salePerM2: 6_600, rentPerM2: 27, lat: -12.0776, lon: -77.0925 },
] as const;
