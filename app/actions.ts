'use server';

/**
 * Annotations you make by hand, stored on `Property` rather than on the listing.
 *
 * This is the whole reason properties exist as a separate table. A favourite kept
 * against a posting id disappears the moment the broker reposts the apartment, which
 * is precisely when you most want to know you had already looked at it — the repost is
 * the seller resetting the anchor.
 *
 * `discardReason` is worth filling in: in three months, twenty discards that all say
 * "first floor facing a noisy avenue" are the model telling you which variable it is
 * missing.
 */

import { revalidatePath, revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db';
import {
  confirmDuplicate as confirmDuplicateInDb,
  DuplicateReviewError,
  rejectDuplicate as rejectDuplicateInDb,
  splitPosting as splitPostingInDb,
} from '@/lib/duplicates';

/**
 * The table reads rows from a cache keyed by scrape run (`getCachedSaleListings`),
 * which a path revalidation does not reach. Expiring the tag at once is what makes
 * a change show on the next fetch instead of after the next scrape.
 */
function refreshListings() {
  revalidateTag('sale-listings', { expire: 0 });
  revalidatePath('/departamentos');
  revalidatePath('/favoritos');
}

async function touch(propertyId: string, data: { favorite?: boolean; discarded?: boolean; discardReason?: string | null; notes?: string | null }) {
  await prisma.property.update({ where: { id: propertyId }, data });
  refreshListings();
}

export async function setFavorite(propertyId: string, favorite: boolean): Promise<void> {
  await touch(propertyId, { favorite });
}

export async function setDiscarded(
  propertyId: string,
  discarded: boolean,
  discardReason?: string | null
): Promise<void> {
  await touch(propertyId, {
    discarded,
    // Clearing the discard clears its reason, so a stale explanation cannot outlive
    // the decision it explained.
    discardReason: discarded ? (discardReason?.trim() || null) : null,
  });
}

export async function setNotes(propertyId: string, notes: string): Promise<void> {
  await touch(propertyId, { notes: notes.trim() || null });
}

export type ReviewResult = { ok: true } | { ok: false; error: string };

/** An expected refusal comes back as a message; anything else is a bug and is thrown. */
async function review(run: () => Promise<void>): Promise<ReviewResult> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DuplicateReviewError) return { ok: false, error: error.message };
    throw error;
  }
  refreshListings();
  return { ok: true };
}

/** "es el mismo": merge the two properties of a flagged pair. */
export async function confirmDuplicate(candidateId: string): Promise<ReviewResult> {
  return review(() => confirmDuplicateInDb(candidateId));
}

/** "no es el mismo" on a flag: keep both and never flag the pair again. */
export async function rejectDuplicate(candidateId: string): Promise<ReviewResult> {
  return review(() => rejectDuplicateInDb(candidateId));
}

/** "no es el mismo" on a copy: move it to its own property. */
export async function splitPosting(postingId: string): Promise<ReviewResult> {
  return review(() => splitPostingInDb(postingId));
}
