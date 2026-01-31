/**
 * Shared list of district slugs for Lima.
 * Used by Urbania and can be reused by other platforms (same list, platform-specific URL format).
 */

export const LIMA_DISTRICT_SLUGS = [
  'lince',
  'jesus-maria',
  'san-isidro',
  'pueblo-libre',
  'magdalena',
  'surquillo',
  'miraflores',
  'san-borja',
  'santiago-de-surco',
  'san-miguel',
] as const;

export type LimaDistrictSlug = (typeof LIMA_DISTRICT_SLUGS)[number];

/** Display names for reporting (optional) */
export const LIMA_DISTRICT_NAMES: Record<string, string> = {
  'lince': 'Lince',
  'jesus-maria': 'Jesús María',
  'san-isidro': 'San Isidro',
  'pueblo-libre': 'Pueblo Libre',
  'magdalena': 'Magdalena',
  'surquillo': 'Surquillo',
  'miraflores': 'Miraflores',
  'san-borja': 'San Borja',
  'santiago-de-surco': 'Santiago de Surco',
  'san-miguel': 'San Miguel',
};
