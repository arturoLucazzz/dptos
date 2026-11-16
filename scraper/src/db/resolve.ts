/**
 * Which project and which property a new posting belongs to.
 *
 * The rules live in lib/dedupe.ts and lib/project-match.ts; this file only loads
 * candidates and writes the outcome. A wrong merge is worse than a missed
 * duplicate, so only a HIGH decision attaches; MEDIUM and LOW become review rows.
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { DuplicateStatus } from '@/lib/generated/prisma/enums';
import { decideProperty, nameNorm, pairKey, type PropertyDecision } from '@/lib/dedupe';
import { dedupePropertySelect, dedupeSideFromCard, dedupeSideFromProperty } from '@/lib/dedupe-side';
import { areaBucket, normalizeAddress, propertyFingerprint } from '@/lib/fingerprint';
import type { ListingCard, SourceId } from '@/lib/listing-card';
import { sameProject } from '@/lib/project-match';

const CANDIDATE_LIMIT = 200;

function projectKey(source: SourceId, id: string): string {
  return `${source}:${id}`;
}

/** The project a PROJECT posting describes: by source key, then by `sameProject`, else a new one. */
export async function resolveProject(card: ListingCard, districtSlug: string): Promise<string | null> {
  if (!card.sourcePostingId) return null;
  const key = projectKey(card.source, card.sourcePostingId);

  const byKey = await prisma.project.findFirst({ where: { sourceKeys: { has: key } }, select: { id: true } });
  if (byKey) return byKey.id;

  const name = card.buildingName ?? card.title;
  const side = {
    districtSlug,
    nameNorm: nameNorm(name),
    addressNorm: normalizeAddress(card.address),
    latitude: card.latitude,
    longitude: card.longitude,
  };

  const projects = await prisma.project.findMany({
    where: { districtSlug },
    select: { id: true, districtSlug: true, nameNorm: true, addressNorm: true, latitude: true, longitude: true },
  });
  const matches = projects.filter((project) =>
    sameProject(side, {
      districtSlug: project.districtSlug,
      nameNorm: project.nameNorm,
      addressNorm: project.addressNorm,
      latitude: project.latitude == null ? null : Number(project.latitude),
      longitude: project.longitude == null ? null : Number(project.longitude),
    })
  );
  // Two projects that both look like this one: linking to either is a guess, so
  // a new project is created and the owner can see the copies separately.
  if (matches.length > 1) {
    console.warn(
      `  project ${key}: matches ${matches.length} projects in ${districtSlug} ` +
        `(${matches.map((project) => project.id).join(', ')}), creating a new one`
    );
  } else if (matches.length === 1) {
    const match = matches[0];
    await prisma.project.update({ where: { id: match.id }, data: { sourceKeys: { push: key } } });
    return match.id;
  }

  const created = await prisma.project.create({
    data: {
      districtSlug,
      name,
      nameNorm: side.nameNorm,
      developerName: card.developerName,
      addressNorm: side.addressNorm,
      latitude: card.latitude,
      longitude: card.longitude,
      deliveryDate: card.deliveryDate,
      stage: card.developmentStage,
      sourceKeys: [key],
    },
    select: { id: true },
  });
  return created.id;
}

/** The project a unit card names through its project source key, if that project is known. */
async function projectOfUnit(card: ListingCard): Promise<{ id: string } | null> {
  if (!card.projectSourceId) return null;
  return prisma.project.findFirst({
    where: { sourceKeys: { has: projectKey(card.source, card.projectSourceId) } },
    select: { id: true },
  });
}

/** Ids among `candidateIds` that the owner already rejected as the same apartment as `propertyId`. */
async function rejectedPartners(propertyId: string, candidateIds: string[]): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await prisma.duplicateCandidate.findMany({
    where: {
      status: DuplicateStatus.REJECTED,
      OR: [
        { propertyAId: propertyId, propertyBId: { in: candidateIds } },
        { propertyBId: propertyId, propertyAId: { in: candidateIds } },
      ],
    },
    select: { propertyAId: true, propertyBId: true },
  });
  return new Set(rows.map((row) => (row.propertyAId === propertyId ? row.propertyBId : row.propertyAId)));
}

/**
 * Write MEDIUM and LOW flags for `propertyId`, smaller id first. A pair the
 * owner rejected is never flagged again, and an existing row of any status is
 * left as it is.
 */
export async function writeDuplicateFlags(propertyId: string, flags: PropertyDecision['flags']): Promise<number> {
  const rejected = await rejectedPartners(
    propertyId,
    flags.map((flag) => flag.propertyId)
  );
  const data = flags
    .filter((flag) => flag.propertyId !== propertyId && !rejected.has(flag.propertyId))
    .map((flag) => {
      const [propertyAId, propertyBId] = pairKey(propertyId, flag.propertyId);
      return { propertyAId, propertyBId, level: flag.level, signals: flag.signals as Prisma.InputJsonValue };
    });
  if (data.length === 0) return 0;
  const written = await prisma.duplicateCandidate.createMany({ data, skipDuplicates: true });
  return written.count;
}

/**
 * Find or create the physical apartment a new UNIT posting belongs to.
 *
 * The fingerprint, address, coordinates, street and building only narrow the
 * search; `decideProperty` makes the decision.
 */
export async function resolveUnitProperty(
  card: ListingCard,
  districtSlug: string,
  pricePen: number | null
): Promise<string> {
  const subject = dedupeSideFromCard(card, districtSlug, pricePen);
  const area = subject.areaM2;
  const fingerprint = propertyFingerprint({ districtSlug, address: card.address, bedrooms: card.bedrooms, area });

  const near =
    card.latitude != null && card.longitude != null
      ? {
          latitude: { gte: card.latitude - 0.002, lte: card.latitude + 0.002 },
          longitude: { gte: card.longitude - 0.002, lte: card.longitude + 0.002 },
        }
      : null;
  const clauses: Prisma.PropertyWhereInput[] = [{ fingerprint }];
  if (subject.addressNorm) clauses.push({ addressNorm: subject.addressNorm });
  if (near) clauses.push(near);
  if (subject.streetNorm) clauses.push({ streetNorm: subject.streetNorm });
  if (subject.buildingNorm) clauses.push({ buildingNorm: subject.buildingNorm });

  const rows = await prisma.property.findMany({
    where: { districtSlug, OR: clauses },
    select: dedupePropertySelect,
    take: CANDIDATE_LIMIT,
  });

  const decision = decideProperty(subject, rows.map(dedupeSideFromProperty));
  const project = await projectOfUnit(card);

  if (decision.attachTo) {
    // Only fills a missing link: a project the property already has is kept.
    if (project) {
      await prisma.property.updateMany({
        where: { id: decision.attachTo, projectId: null },
        data: { projectId: project.id },
      });
    }
    return decision.attachTo;
  }

  const created = await prisma.property.create({
    data: {
      districtSlug,
      fingerprint,
      addressNorm: subject.addressNorm,
      streetNorm: subject.streetNorm,
      buildingNorm: subject.buildingNorm,
      unitNumber: subject.unitNumber,
      bedrooms: card.bedrooms,
      areaBucket: areaBucket(area),
      latitude: card.latitude,
      longitude: card.longitude,
      projectId: project?.id ?? null,
    },
    select: { id: true },
  });

  await writeDuplicateFlags(created.id, decision.flags);
  return created.id;
}
