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

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';

async function touch(propertyId: string, data: { favorite?: boolean; discarded?: boolean; discardReason?: string | null; notes?: string | null }) {
  await prisma.property.update({ where: { id: propertyId }, data });
  revalidatePath('/departamentos');
  revalidatePath('/favoritos');
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
