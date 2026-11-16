import { distanceMetres } from './fingerprint';

export interface ProjectSide {
  districtSlug: string;
  nameNorm: string | null;
  addressNorm: string | null;
  latitude: number | null;
  longitude: number | null;
}

const CLOSE_METRES = 30;

function sharesHalfOfShorterName(a: string, b: string): boolean {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  const shorter = Math.min(ta.size, tb.size);
  if (shorter === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared * 2 >= shorter;
}

/** Whether two building records from different sources are the same project. */
export function sameProject(a: ProjectSide, b: ProjectSide): boolean {
  if (a.districtSlug !== b.districtSlug) return false;

  if (a.nameNorm !== null && a.nameNorm === b.nameNorm) return true;

  if (a.addressNorm !== null && a.addressNorm === b.addressNorm && /\d/.test(a.addressNorm)) {
    return true;
  }

  if (
    a.nameNorm !== null &&
    b.nameNorm !== null &&
    a.latitude !== null &&
    a.longitude !== null &&
    b.latitude !== null &&
    b.longitude !== null
  ) {
    const metres = distanceMetres(
      { latitude: a.latitude, longitude: a.longitude },
      { latitude: b.latitude, longitude: b.longitude }
    );
    return metres <= CLOSE_METRES && sharesHalfOfShorterName(a.nameNorm, b.nameNorm);
  }
  return false;
}
