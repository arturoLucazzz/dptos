import type { Ring } from './geo';

/** Exact for the sphere that haversineM uses, so offsets land where the test says. */
export const M_PER_DEG_LAT = (Math.PI / 180) * 6_371_008.8;

/** A square about 1 km wide centered on the point, as a closed ring. Test use only. */
export function squareRing(lat: number, lon: number, halfDeg = 0.0045): Ring {
  return [
    [lon - halfDeg, lat - halfDeg],
    [lon + halfDeg, lat - halfDeg],
    [lon + halfDeg, lat + halfDeg],
    [lon - halfDeg, lat + halfDeg],
    [lon - halfDeg, lat - halfDeg],
  ];
}
