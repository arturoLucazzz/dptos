/**
 * Writing observations to the database.
 *
 * Two rules drive everything here:
 *
 * 1. A snapshot row is written the first time a listing is seen, and then only
 *    when something changes. Writing one row per run would be roughly 730,000
 *    rows a year to record "420, 420, 420, 399, 399"; writing only changes is
 *    about 90,000, and each row means something.
 *
 * 2. `lastSeenAt` is refreshed on every sighting, which is what makes "possibly
 *    sold" a reversible state derived from a date rather than a counter. The one
 *    failure that this does not heal on its own is a broken parser: if a CSS
 *    change makes every district return nothing for three runs, every listing
 *    crosses the threshold and the database records that all of Lima was sold.
 *    That is what the sanity gate below exists to prevent.
 */

import { prisma } from '@/lib/db';
import type { Prisma, PostingSnapshot } from '@/lib/generated/prisma/client';
import { Operation, PostingKind, ScrapeMode, ScrapeStatus, Currency } from '@/lib/generated/prisma/enums';
import { toPen } from '@/lib/money';
import { flagsForListing, flagsFromSlug } from '@/lib/quality-flags';
import {
  areaBucket,
  normalizeAddress,
  propertyFingerprint,
  propertyMatch,
  type MatchCandidate,
} from '@/lib/fingerprint';
import type { UrbaniaCardRaw } from '../scrapers/urbania/types';

/**
 * A district that returns less than this share of what it returned last time is
 * treated as broken rather than empty, and no `lastSeenAt` in it is touched.
 */
const SANITY_GATE_RATIO = Number(process.env.SANITY_GATE_RATIO) || 0.2;

/** Fields whose change is worth a new snapshot row. */
const TRACKED_FIELDS = [
  'pricePen',
  'priceAmount',
  'priceCurrency',
  'areaTotal',
  'areaCovered',
  'bedrooms',
  'bathrooms',
  'parkingSpots',
  'maintenanceAmount',
  'antiquityYears',
  'developmentStage',
  'deliveryDate',
  'publisherId',
  'address',
] as const;

export type DistrictCounts = Record<string, Partial<Record<Operation, number>>>;

export interface RunHandle {
  id: string;
  startedAt: Date;
}

export async function startRun(input: {
  mode: ScrapeMode;
  gitSha?: string | null;
  notes?: string | null;
}): Promise<RunHandle> {
  const run = await prisma.scrapeRun.create({
    data: {
      mode: input.mode,
      status: ScrapeStatus.RUNNING,
      gitSha: input.gitSha ?? null,
      notes: input.notes ?? null,
    },
    select: { id: true, startedAt: true },
  });
  return run;
}

export async function finishRun(
  runId: string,
  input: {
    status: ScrapeStatus;
    districtCounts: DistrictCounts;
    pagesFetched: number;
    skippedDistricts: string[];
    errors?: unknown;
  }
): Promise<void> {
  await prisma.scrapeRun.update({
    where: { id: runId },
    data: {
      status: input.status,
      finishedAt: new Date(),
      districtCounts: input.districtCounts as Prisma.InputJsonValue,
      pagesFetched: input.pagesFetched,
      skippedDistricts: input.skippedDistricts,
      errors: (input.errors ?? null) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Whether a district's count collapsed compared to the last run that measured it.
 *
 * Ten lines of code, and the only protection against a broken parser silently
 * marking a whole district as sold.
 */
export async function shouldSkipDistrict(
  districtSlug: string,
  operation: Operation,
  observedCount: number,
  currentRunId: string
): Promise<{ skip: boolean; previousCount: number | null }> {
  const previous = await prisma.scrapeRun.findFirst({
    where: {
      id: { not: currentRunId },
      status: { in: [ScrapeStatus.SUCCESS, ScrapeStatus.PARTIAL] },
    },
    orderBy: { startedAt: 'desc' },
    select: { districtCounts: true },
  });

  const counts = (previous?.districtCounts ?? null) as DistrictCounts | null;
  const previousCount = counts?.[districtSlug]?.[operation] ?? null;
  if (previousCount == null || previousCount === 0) return { skip: false, previousCount };

  return { skip: observedCount < previousCount * SANITY_GATE_RATIO, previousCount };
}

interface SnapshotFields {
  priceAmount: Prisma.Decimal | number | null;
  priceCurrency: Currency | null;
  pricePen: number | null;
  priceIsFrom: boolean;
  areaTotal: number | null;
  areaCovered: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  halfBathrooms: number | null;
  parkingSpots: number | null;
  maintenanceAmount: number | null;
  maintenanceCurrency: Currency | null;
  antiquityYears: number | null;
  areaMin: number | null;
  areaMax: number | null;
  bedroomsMin: number | null;
  bedroomsMax: number | null;
  unitsCount: number | null;
  developmentStage: string | null;
  deliveryDate: string | null;
  title: string | null;
  address: string | null;
  subzoneName: string | null;
  latitude: number | null;
  longitude: number | null;
  publisherId: string | null;
  publisherName: string | null;
  publisherTypeId: string | null;
  status: string | null;
  modifiedDate: Date | null;
  firstDateOnline: Date | null;
  hasDuplicate: boolean | null;
  imageUrl: string | null;
  qualityFlags: string[];
}

function dateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function snapshotFieldsFromCard(card: UrbaniaCardRaw, operation: Operation): SnapshotFields {
  const pricePen = toPen(card.priceAmount, card.priceCurrency);
  const area = card.areaTotal ?? card.areaCovered;

  return {
    priceAmount: card.priceAmount,
    priceCurrency: card.priceCurrency as Currency | null,
    pricePen,
    priceIsFrom: card.priceIsFrom,
    areaTotal: card.areaTotal,
    areaCovered: card.areaCovered,
    bedrooms: card.bedrooms,
    bathrooms: card.bathrooms,
    halfBathrooms: card.halfBathrooms,
    parkingSpots: card.parkingSpots,
    maintenanceAmount: card.maintenanceAmount,
    maintenanceCurrency: card.maintenanceCurrency as Currency | null,
    antiquityYears: card.antiquityYears,
    areaMin: card.areaMin,
    areaMax: card.areaMax,
    bedroomsMin: card.bedroomsMin,
    bedroomsMax: card.bedroomsMax,
    unitsCount: card.unitsCount,
    developmentStage: card.developmentStage,
    deliveryDate: card.deliveryDate,
    title: card.title,
    address: card.address,
    subzoneName: card.subzoneName,
    latitude: card.latitude,
    longitude: card.longitude,
    publisherId: card.publisherId,
    publisherName: card.publisherName,
    publisherTypeId: card.publisherTypeId,
    status: card.status,
    modifiedDate: dateOrNull(card.modifiedDate),
    firstDateOnline: dateOrNull(card.firstDateOnline),
    hasDuplicate: card.hasDuplicate,
    imageUrl: card.imageUrl,
    qualityFlags: [
      ...flagsForListing({
        operation,
        pricePen,
        areaM2: area,
        priceIsFrom: card.priceIsFrom,
      }),
      ...flagsFromSlug({
        sourcePath: card.sourcePath,
        bedrooms: card.bedrooms,
        districtName: card.districtName,
      }),
    ],
  };
}

/** Compare through strings so Decimal and number forms of the same value agree. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') return String(a) === String(b);
  return String(a) === String(b);
}

function hasChanged(previous: PostingSnapshot | null, next: SnapshotFields): boolean {
  if (!previous) return true;
  return TRACKED_FIELDS.some(
    (field) => !sameValue((previous as unknown as Record<string, unknown>)[field], next[field])
  );
}

/**
 * Find or create the physical apartment this listing belongs to.
 *
 * The fingerprint only narrows the search; `propertyMatch` makes the decision.
 */
async function resolveProperty(
  card: UrbaniaCardRaw,
  districtSlug: string,
  pricePen: number | null
): Promise<string | null> {
  const addressNorm = normalizeAddress(card.address);
  const area = card.areaTotal ?? card.areaCovered;
  const bucket = areaBucket(area);
  const fingerprint = propertyFingerprint({
    districtSlug,
    address: card.address,
    bedrooms: card.bedrooms,
    area,
  });

  // Candidates: same district, and either the same blocking key, the same street,
  // or nearby coordinates. The fingerprint is not consulted as a decision, only to
  // narrow the search.
  const candidates = await prisma.property.findMany({
    where: {
      districtSlug,
      OR: [
        { fingerprint },
        addressNorm ? { addressNorm } : {},
        card.latitude != null && card.longitude != null
          ? {
              latitude: { gte: card.latitude - 0.002, lte: card.latitude + 0.002 },
              longitude: { gte: card.longitude - 0.002, lte: card.longitude + 0.002 },
            }
          : {},
      ].filter((clause) => Object.keys(clause).length > 0),
    },
    select: {
      id: true,
      districtSlug: true,
      addressNorm: true,
      bedrooms: true,
      areaBucket: true,
      latitude: true,
      longitude: true,
      postings: {
        select: {
          currentSnapshot: { select: { pricePen: true, areaTotal: true, areaCovered: true } },
        },
      },
    },
    take: 200,
  });

  const subject = {
    districtSlug,
    addressNorm,
    bedrooms: card.bedrooms,
    area,
    latitude: card.latitude,
    longitude: card.longitude,
    pricePen,
  };

  let best: { id: string; closeness: number } | null = null;
  for (const candidate of candidates) {
    const snapshots = candidate.postings
      .map((posting) => posting.currentSnapshot)
      .filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot != null);

    // A multi-listed apartment has several prices; the cheapest live one is the
    // real anchor, so that is what the comparison uses.
    const prices = snapshots.map((s) => s.pricePen).filter((p) => p != null).map(Number);
    const areas = snapshots
      .map((s) => s.areaTotal ?? s.areaCovered)
      .filter((a) => a != null)
      .map(Number);

    const asCandidate: MatchCandidate = {
      districtSlug: candidate.districtSlug,
      addressNorm: candidate.addressNorm,
      bedrooms: candidate.bedrooms,
      areaM2: areas.length ? areas[0] : null,
      latitude: candidate.latitude == null ? null : Number(candidate.latitude),
      longitude: candidate.longitude == null ? null : Number(candidate.longitude),
      pricePen: prices.length ? Math.min(...prices) : null,
    };
    const match = propertyMatch(subject, asCandidate);
    if (match.same && (!best || match.closeness > best.closeness)) {
      best = { id: candidate.id, closeness: match.closeness };
    }
  }
  if (best) return best.id;

  const created = await prisma.property.create({
    data: {
      districtSlug,
      fingerprint,
      addressNorm,
      bedrooms: card.bedrooms,
      areaBucket: bucket,
      latitude: card.latitude,
      longitude: card.longitude,
    },
    select: { id: true },
  });
  return created.id;
}

export interface IngestResult {
  created: number;
  updated: number;
  snapshots: number;
}

/**
 * Persist a batch of observed cards.
 *
 * `touchLastSeen` is false when the sanity gate tripped for the district: the rows
 * are still recorded, but nothing is marked as still being on the market, because
 * the run is not trustworthy enough to make that claim.
 */
export async function ingestCards(input: {
  runId: string;
  districtSlug: string;
  operation: Operation;
  cards: UrbaniaCardRaw[];
  observedAt?: Date;
  touchLastSeen?: boolean;
}): Promise<IngestResult> {
  const observedAt = input.observedAt ?? new Date();
  const touchLastSeen = input.touchLastSeen ?? true;
  const result: IngestResult = { created: 0, updated: 0, snapshots: 0 };

  for (const card of input.cards) {
    if (!card.sourcePostingId) continue;

    const operation = card.operation ? (card.operation as Operation) : input.operation;
    const districtSlug = input.districtSlug;

    const existing = await prisma.posting.findUnique({
      where: {
        source_sourcePostingId_operation: {
          source: 'urbania',
          sourcePostingId: card.sourcePostingId,
          operation,
        },
      },
      include: { currentSnapshot: true },
    });

    const fields = snapshotFieldsFromCard(card, operation);

    if (!existing) {
      const propertyId = await resolveProperty(card, districtSlug, fields.pricePen);
      const posting = await prisma.posting.create({
        data: {
          source: 'urbania',
          sourcePostingId: card.sourcePostingId,
          sourcePath: card.sourcePath,
          slugPrefix: card.slugPrefix,
          postingCode: card.postingCode,
          kind: card.kind as PostingKind,
          operation,
          districtSlug,
          propertyId,
          // Urbania's own publication date beats the moment we happened to look,
          // when it is available.
          firstSeenAt: fields.firstDateOnline ?? observedAt,
          lastSeenAt: observedAt,
        },
        select: { id: true },
      });

      const snapshot = await prisma.postingSnapshot.create({
        data: { postingId: posting.id, scrapeRunId: input.runId, observedAt, ...fields, rawCard: card as unknown as Prisma.InputJsonValue },
        select: { id: true },
      });
      await prisma.posting.update({
        where: { id: posting.id },
        data: { currentSnapshotId: snapshot.id },
      });

      result.created++;
      result.snapshots++;
      continue;
    }

    const changed = hasChanged(existing.currentSnapshot, fields);
    if (changed) {
      const snapshot = await prisma.postingSnapshot.create({
        data: { postingId: existing.id, scrapeRunId: input.runId, observedAt, ...fields, rawCard: card as unknown as Prisma.InputJsonValue },
        select: { id: true },
      });
      await prisma.posting.update({
        where: { id: existing.id },
        data: {
          currentSnapshotId: snapshot.id,
          // A listing that came back at the same price gets no snapshot, only a
          // fresh lastSeenAt, which is enough to un-mark it as possibly sold.
          ...(touchLastSeen ? { lastSeenAt: observedAt } : {}),
          sourcePath: card.sourcePath ?? existing.sourcePath,
          postingCode: card.postingCode ?? existing.postingCode,
        },
      });
      result.snapshots++;
    } else if (touchLastSeen) {
      await prisma.posting.update({
        where: { id: existing.id },
        data: { lastSeenAt: observedAt },
      });
    }

    result.updated++;
  }

  return result;
}
