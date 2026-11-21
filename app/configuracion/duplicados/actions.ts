"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { invalidateSaleListings } from "@/lib/listings";
import {
  confirmDuplicate as confirmDuplicateInDb,
  DuplicateReviewError,
  rejectDuplicate as rejectDuplicateInDb,
  splitPosting as splitPostingInDb,
} from "@/lib/duplicates";

export type ReviewResult = { ok: true } | { ok: false; error: string };

/**
 * The review reads rows from an in-process memo that a path revalidation does not reach,
 * so a decision drops the memo as well.
 */
function refresh() {
  invalidateSaleListings();
  revalidatePath("/configuracion/duplicados");
}

/** An expected refusal comes back as a message; anything else is a bug and is thrown. */
async function review(id: unknown, run: () => Promise<void>): Promise<ReviewResult> {
  // Server actions are public endpoints: the argument is whatever the request sent.
  if (typeof id !== "string" || id.trim() === "") return { ok: false, error: "Falta el identificador." };
  try {
    await run();
  } catch (error) {
    if (error instanceof DuplicateReviewError) return { ok: false, error: error.message };
    throw error;
  }
  refresh();
  return { ok: true };
}

/** "es el mismo": merge the two properties of a flagged pair. */
export async function confirmDuplicate(candidateId: string): Promise<ReviewResult> {
  return review(candidateId, () => confirmDuplicateInDb(candidateId));
}

/** "no es el mismo" on a flag: keep both and never flag the pair again. */
export async function rejectDuplicate(candidateId: string): Promise<ReviewResult> {
  return review(candidateId, () => rejectDuplicateInDb(candidateId));
}

/** "no es el mismo" on a copy: move it to its own property. */
export async function splitPosting(postingId: string): Promise<ReviewResult> {
  return review(postingId, () => splitPostingInDb(postingId));
}

/**
 * "marcar vendido o retirado" on a hand-entered listing. Nothing else ever removes
 * one, since no scraper sees it. The row is kept, never deleted.
 */
export async function markManualRemoved(postingId: string): Promise<void> {
  if (typeof postingId !== "string" || postingId.trim() === "") return;
  await prisma.posting.updateMany({
    where: { id: postingId, source: "manual", removedAt: null },
    data: { removedAt: new Date() },
  });
  refresh();
}
