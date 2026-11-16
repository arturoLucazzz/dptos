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
  'barranco',
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
  'barranco': 'Barranco',
};

const DISTRICT_ALIASES: Record<string, string> = {
  'surco': 'santiago-de-surco',
  'magdalena del mar': 'magdalena',
};

/** Maps a district name as a source spells it to one of LIMA_DISTRICT_SLUGS, or null. */
export function districtSlugFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const plain = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  const slug = DISTRICT_ALIASES[plain] ?? plain.replace(/ /g, '-');
  return (LIMA_DISTRICT_SLUGS as readonly string[]).includes(slug) ? slug : null;
}

/**
 * Requested district slugs that are not in LIMA_DISTRICT_SLUGS. A run asked
 * for one of these would crawl nothing for it, or file listings under a slug
 * the app never shows.
 */
export function unknownDistrictSlugs(slugs: string[]): string[] {
  return slugs.filter((slug) => !(LIMA_DISTRICT_SLUGS as readonly string[]).includes(slug));
}
