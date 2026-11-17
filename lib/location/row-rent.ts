/**
 * The rent a row shows and every money number uses: the local middle when enough rent
 * listings are near, else the district median. The high end is text only, never money.
 */

import type { RentEstimate } from '../rent';

/** At this many nearby rents the local middle counts as solid. */
export const LOCAL_HIGH_CONFIDENCE_N = 12;

export interface RowRent {
  grossRentPen: number | null;
  rentSampleN: number | null;
  rentConfidence: 'high' | 'low' | null;
  rentHighPen: number | null;
  rentIsLocal: boolean;
  rentMaxDistanceM: number | null;
}

export function rentForRow(input: {
  areaM2: number | null;
  local: { perM2: number; highPerM2: number; n: number; maxDistanceM: number } | null;
  district: RentEstimate | null;
}): RowRent {
  const { areaM2, local, district } = input;
  if (local && areaM2 != null && areaM2 > 0) {
    return {
      grossRentPen: Math.round(local.perM2 * areaM2),
      rentSampleN: local.n,
      rentConfidence: local.n >= LOCAL_HIGH_CONFIDENCE_N ? 'high' : 'low',
      rentHighPen: Math.round(local.highPerM2 * areaM2),
      rentIsLocal: true,
      rentMaxDistanceM: local.maxDistanceM,
    };
  }
  return {
    grossRentPen: district?.grossRentPen ?? null,
    rentSampleN: district?.n ?? null,
    rentConfidence: district?.confidence ?? null,
    rentHighPen: null,
    rentIsLocal: false,
    rentMaxDistanceM: null,
  };
}
