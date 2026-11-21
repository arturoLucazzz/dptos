/**
 * The recompute step after a zone change: score every apartment again, then expire the
 * listings memo so the next read shows the new scores. Used by the workspace map.
 *
 * Not a 'use server' file on purpose: it is a step the actions call, not an action itself.
 * It does not revalidate paths; the caller decides (the workspace must not re-render).
 */

import { invalidateSaleListings } from '@/lib/listings';
import { prisma } from '@/lib/db';
import { refreshLocations } from '@/lib/location/refresh';

export const RECOMPUTE_FAILED = 'La zona se guardó, pero no se pudo recalcular la ubicación. Corre pnpm location:refresh.';

/** Null when the scores are fresh; otherwise the message to show. */
export async function recomputeLocationScores(): Promise<string | null> {
  try {
    await refreshLocations(prisma);
    return null;
  } catch (error) {
    console.error('location refresh after a zone change failed', error);
    return RECOMPUTE_FAILED;
  } finally {
    invalidateSaleListings();
  }
}
