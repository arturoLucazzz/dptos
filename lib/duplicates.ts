/**
 * The owner's duplicate review: confirm a flagged pair, reject it, or split a
 * copy off a property that was merged by mistake.
 *
 * Postings and snapshots are never deleted here: a confirm moves postings, a
 * split moves one posting. Each action runs in one transaction, so a failure
 * halfway leaves the data as it was.
 */

import type { Prisma } from './generated/prisma/client';
import { DuplicateLevel, DuplicateStatus } from './generated/prisma/enums';
import { nameNorm, pairKey, streetNorm, type DedupeSide } from './dedupe';
import { dedupePropertySelect, dedupeSideFromProperty, keysToFill, unitNorm } from './dedupe-side';
import { areaBucket, normalizeAddress, propertyFingerprint } from './fingerprint';

export type Annotations = {
  favorite: boolean;
  discarded: boolean;
  discardReason: string | null;
  notes: string | null;
};

/** One owner decision as a test fixture: the two sides the matcher compares, and the verdict. */
export interface DuplicateDecision {
  status: 'CONFIRMED' | 'REJECTED';
  a: DedupeSide;
  b: DedupeSide;
}

/** An expected refusal (stale candidate, single copy). The server action shows its message. */
export class DuplicateReviewError extends Error {
  override name = 'DuplicateReviewError';
}

const NOTES_SEPARATOR = '\n---\n';

/**
 * Annotations of two properties that turn out to be one apartment. `a` is the
 * property that is kept.
 *
 * A favorite on either side survives. The merged property stays discarded only
 * if both were, because a visible copy is one the owner still wants to see.
 */
export function mergeAnnotations(a: Annotations, b: Annotations): Annotations {
  const discarded = a.discarded && b.discarded;
  const parts = [a.notes, b.notes].map((note) => note?.trim() ?? '').filter(Boolean);
  return {
    favorite: a.favorite || b.favorite,
    discarded,
    discardReason: discarded ? (a.discardReason ?? b.discardReason) : null,
    notes: parts.length ? parts.join(NOTES_SEPARATOR) : null,
  };
}

export interface CandidateRow {
  id: string;
  propertyAId: string;
  propertyBId: string;
  status: 'OPEN' | 'CONFIRMED' | 'REJECTED';
}

/** A decision says more than an open flag, so it is the row a pair keeps. */
const STATUS_RANK: Record<CandidateRow['status'], number> = { REJECTED: 2, CONFIRMED: 1, OPEN: 0 };

/**
 * What happens to the other candidates when `removedId` merges into `keptId`.
 *
 * `rows` are every candidate of either property except the one being decided.
 * A row of the removed property is moved to the kept one. A row that becomes a
 * self pair is removed, and when two rows end up on one pair, the one with a
 * decision stays (the kept property's row on a tie). Run `remove` before
 * `update`: an update can take a pair a removed row still holds.
 */
export function planCandidateRepoint(
  keptId: string,
  removedId: string,
  rows: CandidateRow[]
): { update: { id: string; propertyAId: string; propertyBId: string }[]; remove: string[] } {
  const byPair = new Map<string, { row: CandidateRow; pair: [string, string]; moved: boolean }>();
  const remove: string[] = [];

  // The kept property's own rows first, so they win ties.
  const ordered = [...rows].sort((x, y) => Number(touches(x, removedId)) - Number(touches(y, removedId)));
  for (const row of ordered) {
    const moved = touches(row, removedId);
    const a = row.propertyAId === removedId ? keptId : row.propertyAId;
    const b = row.propertyBId === removedId ? keptId : row.propertyBId;
    if (a === b) {
      remove.push(row.id);
      continue;
    }
    const pair = pairKey(a, b);
    const key = pair.join('|');
    const held = byPair.get(key);
    if (!held) {
      byPair.set(key, { row, pair, moved });
    } else if (STATUS_RANK[row.status] > STATUS_RANK[held.row.status]) {
      remove.push(held.row.id);
      byPair.set(key, { row, pair, moved });
    } else {
      remove.push(row.id);
    }
  }

  const update = [...byPair.values()]
    .filter((entry) => entry.moved)
    .map(({ row, pair }) => ({ id: row.id, propertyAId: pair[0], propertyBId: pair[1] }));
  return { update, remove };
}

function touches(row: CandidateRow, propertyId: string): boolean {
  return row.propertyAId === propertyId || row.propertyBId === propertyId;
}

// The client is loaded on first use, so the pure functions above can be tested
// without a database.
async function db() {
  return (await import('./db')).prisma;
}

const STALE = 'Este posible duplicado ya fue revisado.';
const CHANGED = 'Los datos cambiaron mientras se guardaba. Vuelve a cargar e intenta de nuevo.';

/**
 * A database error that only means another review got there first: a row it
 * needed was deleted (P2025), or Postgres aborted one of two crossing
 * transactions (P2034, serialization failure, deadlock). The action reports it
 * instead of crashing. Anything else is a bug and stays an error.
 */
export function toReviewError(error: unknown): DuplicateReviewError | null {
  if (error instanceof DuplicateReviewError) return error;
  if (typeof error !== 'object' || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === 'P2025') return new DuplicateReviewError(STALE);
  if (code === 'P2034' || code === '40001' || code === '40P01') return new DuplicateReviewError(CHANGED);
  if (typeof message === 'string' && /deadlock detected|could not serialize access/i.test(message)) {
    return new DuplicateReviewError(CHANGED);
  }
  return null;
}

async function inReviewTransaction(run: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  const prisma = await db();
  try {
    await prisma.$transaction(run);
  } catch (error) {
    throw toReviewError(error) ?? error;
  }
}

/**
 * Row locks on the properties, smaller id first so two reviews never wait on
 * each other in a circle. Returns the ids that still exist.
 */
async function lockProperties(tx: Prisma.TransactionClient, ids: string[]): Promise<Set<string>> {
  const sorted = [...new Set(ids)].sort();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Property" WHERE id = ANY(${sorted}::text[]) ORDER BY id FOR UPDATE`;
  return new Set(rows.map((row) => row.id));
}

const annotationSelect = {
  id: true,
  createdAt: true,
  favorite: true,
  discarded: true,
  discardReason: true,
  notes: true,
  unitNumber: true,
  buildingNorm: true,
  streetNorm: true,
  projectId: true,
} satisfies Prisma.PropertySelect;

/**
 * The owner says the two properties of an open candidate are one apartment.
 *
 * The older property is kept and receives every posting, the merged
 * annotations and the keys it lacked; the other property is deleted after its
 * candidates are moved.
 */
export async function confirmDuplicate(candidateId: string): Promise<void> {
  await inReviewTransaction(async (tx) => {
    const peek = await tx.duplicateCandidate.findUnique({
      where: { id: candidateId },
      select: { propertyAId: true, propertyBId: true },
    });
    if (!peek) throw new DuplicateReviewError('Este posible duplicado ya no existe.');
    // Lock the properties before claiming, so a confirm on a neighbouring pair
    // waits here instead of crossing this one.
    const alive = await lockProperties(tx, [peek.propertyAId, peek.propertyBId]);
    const candidate = await claimCandidate(tx, candidateId, DuplicateStatus.CONFIRMED);
    if (candidate.propertyAId !== peek.propertyAId || candidate.propertyBId !== peek.propertyBId) {
      throw new DuplicateReviewError(CHANGED);
    }
    if (!alive.has(candidate.propertyAId) || !alive.has(candidate.propertyBId)) {
      throw new DuplicateReviewError('Una de las dos propiedades ya no existe.');
    }

    const [first, second] = await Promise.all([
      tx.property.findUnique({ where: { id: candidate.propertyAId }, select: annotationSelect }),
      tx.property.findUnique({ where: { id: candidate.propertyBId }, select: annotationSelect }),
    ]);
    const sides = await sidesOf(tx, candidate.propertyAId, candidate.propertyBId);
    if (!first || !second || !sides) throw new DuplicateReviewError('Una de las dos propiedades ya no existe.');
    // Before anything moves: after the merge one side no longer exists. This
    // row, not the candidate, is the durable record of the confirm: the
    // CONFIRMED status written by the claim is deleted with the removed
    // property by the cascade at the end.
    await recordDecision(tx, {
      candidateId: candidate.id,
      status: DuplicateStatus.CONFIRMED,
      level: candidate.level,
      signals: storedSignals(candidate.signals),
      sides,
    });

    const firstIsOlder =
      first.createdAt.getTime() !== second.createdAt.getTime()
        ? first.createdAt < second.createdAt
        : first.id < second.id;
    const [kept, removed] = firstIsOlder ? [first, second] : [second, first];

    await tx.posting.updateMany({ where: { propertyId: removed.id }, data: { propertyId: kept.id } });
    // The kept property also takes the keys only the removed one had, so the
    // next copy is checked against its unit, building and project.
    await tx.property.update({
      where: { id: kept.id },
      data: { ...mergeAnnotations(kept, removed), ...keysToFill(kept, removed) },
    });

    const others = await tx.duplicateCandidate.findMany({
      where: {
        id: { not: candidate.id },
        OR: [
          { propertyAId: { in: [kept.id, removed.id] } },
          { propertyBId: { in: [kept.id, removed.id] } },
        ],
      },
      select: { id: true, propertyAId: true, propertyBId: true, status: true },
    });
    const plan = planCandidateRepoint(kept.id, removed.id, others);
    if (plan.remove.length) await tx.duplicateCandidate.deleteMany({ where: { id: { in: plan.remove } } });
    for (const row of plan.update) {
      await tx.duplicateCandidate.update({
        where: { id: row.id },
        data: { propertyAId: row.propertyAId, propertyBId: row.propertyBId },
      });
    }

    await tx.property.delete({ where: { id: removed.id } });
  });
}

/** The owner says the two properties are different apartments. Ingest never flags the pair again. */
export async function rejectDuplicate(candidateId: string): Promise<void> {
  await inReviewTransaction(async (tx) => {
    const candidate = await claimCandidate(tx, candidateId, DuplicateStatus.REJECTED);
    const sides = await sidesOf(tx, candidate.propertyAId, candidate.propertyBId);
    if (!sides) throw new DuplicateReviewError('Una de las dos propiedades ya no existe.');
    await recordDecision(tx, {
      candidateId: candidate.id,
      status: DuplicateStatus.REJECTED,
      level: candidate.level,
      signals: storedSignals(candidate.signals),
      sides,
    });
  });
}

/**
 * Decides the candidate if it is still OPEN, and returns it. The conditional
 * update takes the row lock, so of two reviews of one candidate exactly one
 * wins; the other sees a count of 0 once the first commits.
 */
async function claimCandidate(
  tx: Prisma.TransactionClient,
  candidateId: string,
  status: typeof DuplicateStatus.CONFIRMED | typeof DuplicateStatus.REJECTED
) {
  const claimed = await tx.duplicateCandidate.updateMany({
    where: { id: candidateId, status: DuplicateStatus.OPEN },
    data: { status, decidedAt: new Date() },
  });
  const candidate = await tx.duplicateCandidate.findUnique({
    where: { id: candidateId },
    select: { id: true, propertyAId: true, propertyBId: true, level: true, signals: true },
  });
  if (claimed.count !== 1) {
    throw new DuplicateReviewError(candidate ? STALE : 'Este posible duplicado ya no existe.');
  }
  if (!candidate) throw new DuplicateReviewError(STALE);
  return candidate;
}

/** Both sides as the matcher sees them now. Null when a property is gone. */
async function sidesOf(tx: Prisma.TransactionClient, propertyAId: string, propertyBId: string) {
  const [a, b] = await Promise.all([
    tx.property.findUnique({ where: { id: propertyAId }, select: dedupePropertySelect }),
    tx.property.findUnique({ where: { id: propertyBId }, select: dedupePropertySelect }),
  ]);
  if (!a || !b) return null;
  return { a: dedupeSideFromProperty(a), b: dedupeSideFromProperty(b) };
}

/** Keeps the verdict with both sides, so it outlives the properties and the candidate. */
async function recordDecision(
  tx: Prisma.TransactionClient,
  decision: {
    candidateId: string | null;
    status: DuplicateStatus;
    level: DuplicateLevel | null;
    signals: Prisma.InputJsonValue;
    sides: { a: DedupeSide; b: DedupeSide };
  }
) {
  await tx.duplicateDecision.create({
    data: {
      candidateId: decision.candidateId,
      status: decision.status,
      level: decision.level,
      signals: decision.signals,
      sideA: decision.sides.a as unknown as Prisma.InputJsonValue,
      sideB: decision.sides.b as unknown as Prisma.InputJsonValue,
    },
  });
}

/** The candidate's stored signals, or none when the column holds something else. */
function storedSignals(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return Array.isArray(value) ? (value as Prisma.InputJsonValue) : [];
}

/**
 * The owner says one copy of a merged property is a different apartment.
 *
 * The posting gets a new property built from its current snapshot, the way
 * ingest builds one, and the pair is stored as rejected. Ingest does not
 * re-resolve existing postings, and the rejection keeps the pair from being
 * flagged again, so the split holds on later scrapes.
 */
export async function splitPosting(postingId: string): Promise<void> {
  await inReviewTransaction(async (tx) => {
    const peek = await tx.posting.findUnique({ where: { id: postingId }, select: { propertyId: true } });
    if (!peek) throw new DuplicateReviewError('Este aviso ya no existe.');
    if (!peek.propertyId) throw new DuplicateReviewError('Este aviso no está agrupado con otros.');
    // Two splits of one two-copy property must not both see two copies, and a
    // confirm must not merge into it halfway: the property row lock orders them.
    const alive = await lockProperties(tx, [peek.propertyId]);
    if (!alive.has(peek.propertyId)) throw new DuplicateReviewError(CHANGED);

    const posting = await tx.posting.findUnique({
      where: { id: postingId },
      select: {
        id: true,
        districtSlug: true,
        propertyId: true,
        projectId: true,
        currentSnapshot: {
          select: {
            address: true,
            bedrooms: true,
            areaTotal: true,
            areaCovered: true,
            latitude: true,
            longitude: true,
            buildingName: true,
            unitNumber: true,
          },
        },
      },
    });
    if (!posting) throw new DuplicateReviewError('Este aviso ya no existe.');
    if (posting.propertyId !== peek.propertyId) throw new DuplicateReviewError(CHANGED);
    const oldPropertyId = peek.propertyId;
    const copies = await tx.posting.count({ where: { propertyId: oldPropertyId } });
    if (copies < 2) throw new DuplicateReviewError('Esta propiedad tiene un solo aviso; no hay nada que separar.');

    const snapshot = posting.currentSnapshot;
    const areaRaw = snapshot?.areaTotal ?? snapshot?.areaCovered ?? null;
    const area = areaRaw == null ? null : Number(areaRaw);
    const address = snapshot?.address ?? null;
    const bedrooms = snapshot?.bedrooms ?? null;

    const created = await tx.property.create({
      data: {
        districtSlug: posting.districtSlug,
        fingerprint: propertyFingerprint({ districtSlug: posting.districtSlug, address, bedrooms, area }),
        addressNorm: normalizeAddress(address),
        streetNorm: streetNorm(address),
        buildingNorm: nameNorm(snapshot?.buildingName),
        unitNumber: unitNorm(snapshot?.unitNumber),
        bedrooms,
        areaBucket: areaBucket(area),
        latitude: snapshot?.latitude ?? null,
        longitude: snapshot?.longitude ?? null,
        // Ingest links a unit to a project through the card's project key, which
        // the snapshot does not keep. The posting's own project is used when it
        // has one; copying the old property's project would be a guess.
        projectId: posting.projectId,
      },
      select: { id: true },
    });
    await tx.posting.update({ where: { id: posting.id }, data: { propertyId: created.id } });

    const [propertyAId, propertyBId] = pairKey(created.id, oldPropertyId);
    // A split merges and deletes nothing, and the two sides only exist apart
    // once the posting has moved, so they are built here.
    const sides = await sidesOf(tx, propertyAId, propertyBId);
    if (!sides) throw new Error(`split ${posting.id}: a property vanished inside the transaction`);
    await recordDecision(tx, {
      candidateId: null,
      status: DuplicateStatus.REJECTED,
      level: null,
      signals: ['split'],
      sides,
    });
    await tx.duplicateCandidate.create({
      data: {
        propertyAId,
        propertyBId,
        // The two were one property, which only a HIGH match or a confirm does.
        level: DuplicateLevel.HIGH,
        signals: ['split'],
        status: DuplicateStatus.REJECTED,
        decidedAt: new Date(),
      },
    });
  });
}
