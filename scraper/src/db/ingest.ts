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
import type { ListingCard, SourceId } from '@/lib/listing-card';
import {
  gateSkips,
  gateVerdict,
  previousCountForSource,
  sliceHistory,
  type GateVerdict,
  type SourceDistrictCounts,
} from '@/lib/sanity-gate';
import { resolveProject, resolveUnitProperty } from './resolve';

/**
 * A source and district that return less than this share of what they returned
 * last time are treated as broken rather than empty, and no `lastSeenAt` in them
 * is touched.
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

/** One source's counts per district and operation. */
export type DistrictCounts = Record<string, Partial<Record<Operation, number>>>;

export interface RunHandle {
  id: string;
  startedAt: Date;
}

export async function startRun(input: {
  mode: ScrapeMode;
  gitSha?: string | null;
  sources: SourceId[];
  notes?: string | null;
}): Promise<RunHandle> {
  const run = await prisma.scrapeRun.create({
    data: {
      mode: input.mode,
      status: ScrapeStatus.RUNNING,
      gitSha: input.gitSha ?? null,
      sources: input.sources,
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
    districtCounts: SourceDistrictCounts;
    pagesFetched: number;
    skippedDistricts: string[];
    errors?: unknown;
    /**
     * The sources this run observed reliably, when that differs from what it
     * started with. A source that failed or was gated must leave the run, or the
     * run would count toward its possibly-sold cutoff and its next gate baseline.
     */
    sources?: SourceId[];
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
      ...(input.sources ? { sources: input.sources } : {}),
    },
  });
}

/** How far back to look for a slice's recent history. */
const GATE_HISTORY_RUNS = 50;

/**
 * Whether a source's count for a district collapsed compared to the last run
 * of that source, and whether that collapse is accepted anyway.
 *
 * The only protection against a broken parser silently marking a whole
 * district as sold. The baseline is the newest run that recorded the source
 * (`recordedSources`: old flat runs were Urbania runs, a replay records none).
 * The verdict rules live in `gateVerdict`.
 */
export async function shouldSkipDistrict(
  source: SourceId,
  districtSlug: string,
  operation: Operation,
  observedCount: number,
  currentRunId: string,
  manualAccept = false
): Promise<{ skip: boolean; previousCount: number | null; verdict: GateVerdict }> {
  const finished = await prisma.scrapeRun.findMany({
    where: { id: { not: currentRunId }, status: { in: [ScrapeStatus.SUCCESS, ScrapeStatus.PARTIAL] } },
    orderBy: { startedAt: 'desc' },
    take: GATE_HISTORY_RUNS,
    select: { districtCounts: true, sources: true },
  });
  const previousCount = previousCountForSource(finished, source, districtSlug, operation);

  // Every finished run, whatever its status: a run where this source was gated
  // can be FAILED when it was the only source, and it still observed the slice.
  const recentRuns = gateSkips(observedCount, previousCount, SANITY_GATE_RATIO)
    ? await prisma.scrapeRun.findMany({
        where: { id: { not: currentRunId }, finishedAt: { not: null } },
        orderBy: { startedAt: 'desc' },
        take: GATE_HISTORY_RUNS,
        select: { districtCounts: true, skippedDistricts: true },
      })
    : [];

  const verdict = gateVerdict({
    observed: observedCount,
    previousCount,
    ratio: SANITY_GATE_RATIO,
    recent: sliceHistory(recentRuns, source, districtSlug, operation),
    manualAccept,
  });
  return { skip: verdict === 'skip', previousCount, verdict };
}

/**
 * Manual listings are never seen again by a scraper, so each run keeps them
 * live until the owner marks them as removed.
 */
export async function refreshManualPostings(observedAt: Date): Promise<number> {
  const result = await prisma.posting.updateMany({
    where: { source: 'manual', removedAt: null },
    data: { lastSeenAt: observedAt },
  });
  return result.count;
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
  imageUrls: string[];
  sourceUrl: string | null;
  buildingName: string | null;
  unitNumber: string | null;
  developerName: string | null;
  qualityFlags: string[];
}

function dateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function snapshotFieldsFromCard(card: ListingCard, operation: Operation): SnapshotFields {
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
    imageUrls: card.imageUrls,
    sourceUrl: card.url || null,
    buildingName: card.buildingName,
    unitNumber: card.unitNumber,
    developerName: card.developerName,
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

function rawCardOf(card: ListingCard): Prisma.InputJsonValue {
  return (card.raw ?? card) as Prisma.InputJsonValue;
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
  source: SourceId;
  districtSlug: string;
  operation: Operation;
  cards: ListingCard[];
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
          source: input.source,
          sourcePostingId: card.sourcePostingId,
          operation,
        },
      },
      include: { currentSnapshot: true },
    });

    const fields = snapshotFieldsFromCard(card, operation);

    if (!existing) {
      // A project card's "desde" price belongs to no single apartment, so it
      // links to a project and never to a property.
      const isProject = card.kind === 'PROJECT';
      const projectId = isProject ? await resolveProject(card, districtSlug) : null;
      const propertyId = isProject ? null : await resolveUnitProperty(card, districtSlug, fields.pricePen);
      const posting = await prisma.posting.create({
        data: {
          source: input.source,
          sourcePostingId: card.sourcePostingId,
          sourcePath: card.sourcePath,
          slugPrefix: card.slugPrefix,
          postingCode: card.postingCode,
          kind: card.kind as PostingKind,
          operation,
          districtSlug,
          propertyId,
          projectId,
          // Urbania's own publication date beats the moment we happened to look,
          // when it is available.
          firstSeenAt: fields.firstDateOnline ?? observedAt,
          lastSeenAt: observedAt,
        },
        select: { id: true },
      });

      const snapshot = await prisma.postingSnapshot.create({
        data: { postingId: posting.id, scrapeRunId: input.runId, observedAt, ...fields, rawCard: rawCardOf(card) },
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
        data: { postingId: existing.id, scrapeRunId: input.runId, observedAt, ...fields, rawCard: rawCardOf(card) },
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
