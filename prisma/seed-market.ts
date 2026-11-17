/**
 * A synthetic market with a *known* price surface.
 *
 * Random data produces charts that look plausible while hiding logic errors. If the
 * prices are generated from a formula, then "is the fair-price model right" has an
 * answer: fit it on the seeded data and compare against the formula. The seed ends by
 * doing exactly that and printing the error, so a broken model fails visibly here
 * instead of silently in a dashboard.
 *
 * Everything is written through the real `ingestCards`, not straight into the tables.
 * That means the seed also exercises property matching, snapshot-on-change and the
 * quality flags, so the ugly cases below are genuinely tests of the ingest path.
 *
 * The ugly cases are the point. A clean market proves nothing:
 *
 *   1. Reposts       — listing vanishes, returns under a new id at a reset price.
 *   2. Duplicates    — two brokers, one apartment, two prices.
 *   3. Price drops   — a seller who cannot sell, cutting every few weeks.
 *   4. Disappearance — some sold for good, some back after a gap at the same price.
 *   5. Currency      — published in USD, later switched to PEN.
 *   6. Missing data  — no area, no bedrooms.
 *   7. Junk          — 8 m² for S/ 493,000, and S/ 55,275,000 for 60 m².
 *   8. A dead district in one run, to trip the sanity gate.
 *
 *   pnpm db:seed:market --weeks=8 --reset
 *
 * Sale S/m² and rent S/m² (ticket ~100 m² / 100) calibrated to Urbania Index /
 * Gestión 2024–2025 for Lima Top and adjacent districts.
 */

import { prisma } from '../lib/db';
import { Operation, PostingKind, ScrapeMode, ScrapeStatus } from '../lib/generated/prisma/enums';
import { fitFairPrice, type Comparable } from '../lib/fair-price';
import { fitIdToDate } from '../lib/posting-age';
import { possiblySoldCutoffs } from '../lib/market';
import { notLivePostingWhere, RUNS_BEFORE_POSSIBLY_SOLD } from '../lib/possibly-sold';
import {
  ingestCards,
  shouldSkipDistrict,
  type DistrictCounts,
} from '../scraper/src/db/ingest';
import type { UrbaniaCardRaw } from '../scraper/src/scrapers/urbania/types';
import { fromUrbaniaCard } from '../lib/listing-card';
import { assertSeedDatabase } from '../lib/seed-guard';

const MS_PER_WEEK = 7 * 86_400_000;

/** The known market. Every price in the seed derives from these numbers. */
const DISTRICTS = [
  { slug: 'lince', name: 'Lince', salePerM2: 7_400, rentPerM2: 35, lat: -12.0865, lon: -77.0365 },
  { slug: 'jesus-maria', name: 'Jesús María', salePerM2: 7_000, rentPerM2: 32, lat: -12.0742, lon: -77.0489 },
  { slug: 'san-isidro', name: 'San Isidro', salePerM2: 9_200, rentPerM2: 38, lat: -12.0970, lon: -77.0360 },
  { slug: 'pueblo-libre', name: 'Pueblo Libre', salePerM2: 6_500, rentPerM2: 28, lat: -12.0760, lon: -77.0620 },
  { slug: 'magdalena', name: 'Magdalena', salePerM2: 6_750, rentPerM2: 30, lat: -12.0920, lon: -77.0700 },
  { slug: 'surquillo', name: 'Surquillo', salePerM2: 7_100, rentPerM2: 35, lat: -12.1122, lon: -77.0175 },
  { slug: 'miraflores', name: 'Miraflores', salePerM2: 8_700, rentPerM2: 36, lat: -12.1211, lon: -77.0296 },
  { slug: 'san-borja', name: 'San Borja', salePerM2: 7_350, rentPerM2: 27, lat: -12.1080, lon: -76.9980 },
  { slug: 'santiago-de-surco', name: 'Santiago de Surco', salePerM2: 6_800, rentPerM2: 27, lat: -12.1350, lon: -76.9930 },
  { slug: 'san-miguel', name: 'San Miguel', salePerM2: 6_600, rentPerM2: 27, lat: -12.0776, lon: -77.0925 },
] as const;

const STREETS = [
  'Jr. Pedro Conde',
  'Av. César Vallejo',
  'Calle Los Geranios',
  'Jr. Manuel Segura',
  'Av. Arenales',
  'Jr. Domingo Casanova',
  'Calle Risso',
  'Av. Ignacio Merino',
  'Jr. José Gálvez',
  'Calle Francisco Lazo',
];

/**
 * The true price of an apartment, before noise.
 *
 * The 0.9 exponent on area is deliberate and load-bearing: it makes price per m² fall
 * as apartments get bigger, which is the effect that makes a district average useless
 * and the regression necessary. If the model cannot recover this, the discount column
 * is measuring size.
 */
function truePriceSale(input: {
  salePerM2: number;
  areaM2: number;
  bedrooms: number;
  parkingSpots: number;
  antiquityYears: number;
  /** Weeks since the start of the simulation, for market drift. */
  week: number;
}): number {
  return (
    input.salePerM2 *
    // Normalized so that `salePerM2` is the rate at 45 m² rather than an abstract
    // coefficient: 45^0.1 x 45^0.9 is 45.
    45 ** 0.1 *
    input.areaM2 ** 0.9 *
    (1 + 0.03 * input.bedrooms) *
    (1 + 0.05 * input.parkingSpots) *
    Math.exp(-0.005 * input.antiquityYears) *
    // Half a percent of drift a month, so the price index has something to find.
    (1 + 0.00125) ** input.week
  );
}

function trueRent(input: { rentPerM2: number; areaM2: number; week: number }): number {
  return input.rentPerM2 * input.areaM2 * (1 + 0.0006) ** input.week;
}

/** Deterministic RNG: a seed that changes between runs is not a fixture. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** One physical apartment, with a life story. */
interface Unit {
  key: string;
  district: (typeof DISTRICTS)[number];
  operation: Operation;
  street: string;
  streetNumber: number;
  areaM2: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpots: number;
  antiquityYears: number;
  lat: number;
  lon: number;
  publisherId: string;
  /** Week the listing first appears. */
  fromWeek: number;
  /** Week it leaves for good, or null if it stays. */
  soldWeek: number | null;
  /** Weeks it is absent and then returns at the same price. */
  goneWeeks: Set<number>;
  /** Cut applied to the asking price, compounding from `dropFromWeek`. */
  dropPctPerCut: number;
  dropFromWeek: number;
  /** Reposted under a new id from this week, at a reset price. */
  repostWeek: number | null;
  repostBumpPct: number;
  /** A second broker publishing the same apartment. */
  duplicateFromWeek: number | null;
  /** Published in USD until this week, then in PEN. */
  usdUntilWeek: number | null;
  omitArea: boolean;
  omitBedrooms: boolean;
  /** Overrides the price surface entirely, for junk. */
  junkPricePen: number | null;
  /** Overrides the area, for junk. */
  junkAreaM2: number | null;
  /** Urbania ids for this unit's listings, assigned to be unique. */
  ids: { original: string; repost: string; duplicate: string };
}

type Variant = 'original' | 'repost' | 'duplicate';

interface BuildOptions {
  weeks: number;
  saleUnitsPerDistrict: number;
  rentUnitsPerDistrict: number;
}

function buildUnits(options: BuildOptions): Unit[] {
  const random = rng(20260727);
  const units: Unit[] = [];

  for (const district of DISTRICTS) {
    for (const operation of [Operation.SALE, Operation.RENT] as const) {
      const count =
        operation === Operation.SALE ? options.saleUnitsPerDistrict : options.rentUnitsPerDistrict;

      for (let i = 0; i < count; i++) {
        const bedrooms = 1 + Math.floor(random() * 4);
        const areaM2 = Math.round(30 + bedrooms * 17 + random() * 25);
        const isNew = random() < 0.25;

        // Most listings are present from the start; the rest arrive over time, which
        // is what makes "days on market" vary.
        const fromWeek = random() < 0.6 ? 0 : Math.floor(random() * options.weeks * 0.8);

        // A tenth sell and never come back. That is the signal the price index needs,
        // since what sells is the cheap end and what lingers is the overpriced end.
        const sells = random() < 0.12;

        const goneWeeks = new Set<number>();
        // A twentieth blink out for a week and return unchanged: no snapshot should be
        // written for that, only a refreshed lastSeenAt.
        if (random() < 0.05) {
          goneWeeks.add(Math.max(1, Math.floor(random() * options.weeks)));
        }

        units.push({
          key: `${district.slug}-${operation}-${i}`,
          district,
          operation,
          street: STREETS[Math.floor(random() * STREETS.length)],
          // Distinct street numbers, so units on one street stay distinguishable and
          // the property matcher is not asked to guess.
          streetNumber: 100 + i * 7 + Math.floor(random() * 5),
          areaM2,
          bedrooms,
          bathrooms: Math.max(1, bedrooms - 1),
          parkingSpots: random() < 0.45 ? 1 : 0,
          antiquityYears: isNew ? 0 : 1 + Math.floor(random() * 34),
          lat: district.lat + (random() - 0.5) * 0.01,
          lon: district.lon + (random() - 0.5) * 0.01,
          publisherId: `pub-${Math.floor(random() * 40)}`,
          fromWeek,
          soldWeek: sells ? fromWeek + 2 + Math.floor(random() * (options.weeks - 2)) : null,
          goneWeeks,
          // A fifth are cutting price, which is who the whole app is looking for.
          dropPctPerCut: random() < 0.2 ? 2 + random() * 4 : 0,
          dropFromWeek: 2 + Math.floor(random() * 6),
          repostWeek: random() < 0.08 ? 4 + Math.floor(random() * (options.weeks - 4)) : null,
          repostBumpPct: 2 + random() * 3,
          duplicateFromWeek: random() < 0.07 ? Math.floor(random() * options.weeks) : null,
          usdUntilWeek: random() < 0.06 ? 3 + Math.floor(random() * 5) : null,
          omitArea: random() < 0.04,
          omitBedrooms: random() < 0.03,
          junkPricePen: null,
          junkAreaM2: null,
          ids: { original: '', repost: '', duplicate: '' },
        });
      }
    }
  }

  // Junk that no per-listing rule can catch, all in one district so the outlier test
  // has a distribution to judge them against.
  const lince = DISTRICTS[0];
  const junkBase: Omit<Unit, 'key' | 'junkPricePen' | 'junkAreaM2' | 'ids'> = {
    district: lince,
    operation: Operation.SALE,
    street: 'Av. Arequipa',
    streetNumber: 1900,
    areaM2: 60,
    bedrooms: 2,
    bathrooms: 1,
    parkingSpots: 0,
    antiquityYears: 10,
    lat: lince.lat,
    lon: lince.lon,
    publisherId: 'pub-junk',
    fromWeek: 0,
    soldWeek: null,
    goneWeeks: new Set(),
    dropPctPerCut: 0,
    dropFromWeek: 0,
    repostWeek: null,
    repostBumpPct: 0,
    duplicateFromWeek: null,
    usdUntilWeek: null,
    omitArea: false,
    omitBedrooms: false,
  };

  units.push(
    // A real listing from the Lince run: 122 times the district's price per m².
    { ...junkBase, key: 'junk-absurd-high', streetNumber: 1901, junkPricePen: 55_275_000, junkAreaM2: 60, ids: blankIds() },
    // Also real: 8 m² for S/ 493,000.
    { ...junkBase, key: 'junk-tiny-area', streetNumber: 1902, junkPricePen: 493_000, junkAreaM2: 8, ids: blankIds() },
    // A monthly rent filed as a sale.
    { ...junkBase, key: 'junk-rent-as-sale', streetNumber: 1903, junkPricePen: 2_800, junkAreaM2: 55, ids: blankIds() },
    // A parking space priced as an apartment.
    { ...junkBase, key: 'junk-garage', streetNumber: 1904, junkPricePen: 45_000, junkAreaM2: 12, ids: blankIds() }
  );

  assignIds(units);
  return units;
}

function blankIds(): Unit['ids'] {
  return { original: '', repost: '', duplicate: '' };
}

/**
 * Asking price of a unit in a given week, including its whole sad history.
 *
 * The market drift is applied at the week the listing was *published*, not the week
 * it is being observed. Sellers do not reprice weekly to track the market; they pick a
 * number and leave it until they decide to cut. Getting this wrong makes every listing
 * look like it changes price every run, which quadruples the snapshot table and makes
 * "the price moved" meaningless as a signal.
 */
function askingPricePen(unit: Unit, week: number, isRepost: boolean): number {
  if (unit.junkPricePen != null) return unit.junkPricePen;

  const areaM2 = unit.junkAreaM2 ?? unit.areaM2;
  const listedWeek = isRepost ? (unit.repostWeek ?? unit.fromWeek) : unit.fromWeek;
  const base =
    unit.operation === Operation.SALE
      ? truePriceSale({
          salePerM2: unit.district.salePerM2,
          areaM2,
          bedrooms: unit.bedrooms,
          parkingSpots: unit.parkingSpots,
          antiquityYears: unit.antiquityYears,
          week: listedWeek,
        })
      : trueRent({ rentPerM2: unit.district.rentPerM2, areaM2, week: listedWeek });

  // Noise, fixed per unit so a listing does not jitter between runs. Only the
  // deliberate price cuts should move it.
  const spread = rng(hash(unit.key))() - 0.5;
  let price = base * Math.exp(spread * 0.16);

  if (unit.dropPctPerCut > 0 && week > unit.dropFromWeek) {
    const cuts = Math.floor((week - unit.dropFromWeek) / 3);
    price *= (1 - unit.dropPctPerCut / 100) ** cuts;
  }

  // A repost resets the anchor upward: same apartment, new id, higher price, zero
  // apparent age. Without property grouping this looks like a fresh listing.
  if (isRepost) price *= 1 + unit.repostBumpPct / 100;

  return Math.round(price);
}

function hash(text: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return h >>> 0;
}

/** Real `postingCode` values from a Lince run, reused across listings exactly as they are. */
const BROKER_CODES = [
  'V&CLEI',
  'Erika',
  'FRANS BARBARAN',
  'cod.gcn',
  '*VBGrax',
  'LULERA',
  '2504',
  'KSIL8098307',
  'LYPR3646',
  '09012026',
];

/**
 * Assign every listing a unique id that still encodes the week it was created.
 *
 * Both properties are needed and they pull against each other. The age model only works
 * because Urbania's ids run roughly in chronological order, so ids have to track the
 * week. But hashing into a per-week range collides: with thousands of listings created
 * in week zero, two apartments sharing an id are indistinguishable from one apartment
 * listed twice — which quietly looks like a matcher bug rather than a generator bug.
 * A counter per week with a large stride gives both uniqueness and chronology.
 */
function assignIds(units: Unit[]): void {
  const random = rng(913);
  const perWeek = new Map<number, number>();
  /** Headroom for ~15k units × variants with random gaps; must not wrap within a week. */
  const WEEK_STRIDE = 2_000_000;
  const next = (week: number): string => {
    // Gaps, because Urbania allocates ids across the whole country and we only see a
    // few districts of Lima. Without them the ids come out perfectly ordered and the
    // id-to-date fit scores a flawless r², which would hide a broken model rather than
    // exercise it.
    const index = (perWeek.get(week) ?? 0) + 1 + Math.floor(random() * 40);
    perWeek.set(week, index);
    return String(140_000_000 + week * WEEK_STRIDE + index);
  };

  // In creation order, so ids increase with time across the whole market.
  const claims: { unit: Unit; variant: Variant; week: number }[] = [];
  for (const unit of units) {
    claims.push({ unit, variant: 'original', week: unit.fromWeek });
    claims.push({ unit, variant: 'duplicate', week: unit.duplicateFromWeek ?? unit.fromWeek });
    if (unit.repostWeek != null) claims.push({ unit, variant: 'repost', week: unit.repostWeek });
  }
  claims.sort((a, b) => a.week - b.week);

  for (const claim of claims) {
    claim.unit.ids[claim.variant] = next(claim.week);
  }
}

function slugFor(unit: Unit, postingId: string): string {
  const operation = unit.operation === Operation.SALE ? 'venta' : 'alquiler';
  const bedrooms = unit.omitBedrooms ? '' : `-${unit.bedrooms}-dormitorio${unit.bedrooms > 1 ? 's' : ''}`;
  return `/inmueble/clasificado/veclapin-${operation}-de-departamento-en-${unit.district.slug}-lima${bedrooms}-${postingId}`;
}

interface CardOptions {
  unit: Unit;
  week: number;
  observedAt: Date;
  isRepost: boolean;
  isDuplicate: boolean;
}

function makeCard(options: CardOptions): UrbaniaCardRaw {
  const { unit, week } = options;
  const variant: Variant = options.isRepost ? 'repost' : options.isDuplicate ? 'duplicate' : 'original';
  const createdWeek = options.isRepost ? unit.repostWeek! : unit.fromWeek;
  const postingId = unit.ids[variant];

  const pricePen = askingPricePen(unit, week, options.isRepost);
  // A second broker on the same apartment quotes a little higher, within the range
  // that should still resolve to one property.
  const price = options.isDuplicate ? Math.round(pricePen * 1.03) : pricePen;

  const inUsd = unit.usdUntilWeek != null && week < unit.usdUntilWeek;
  const areaM2 = unit.junkAreaM2 ?? unit.areaM2;

  // Only a few listings report their publication date, as in the real data. Enough of
  // them, spread across weeks, for the id-to-date fit to have anchors.
  const reportsDate = hash(unit.key) % 20 === 0;

  return {
    sourcePostingId: postingId,
    sourcePath: slugFor(unit, postingId),
    slugPrefix: 'veclapin',
    slugBedrooms: unit.omitBedrooms ? null : unit.bedrooms,
    // Deliberately unreliable, because the real field is. Brokers put their own name
    // or a tag they reuse across their whole portfolio in here, so the seed reproduces
    // that rather than a tidy per-unit code: anything that treats this as an identifier
    // should fail on the seed the same way it would fail in production.
    postingCode: BROKER_CODES[hash(unit.publisherId) % BROKER_CODES.length],
    kind: PostingKind.UNIT,
    operation: unit.operation,
    postingType: 'PROPERTY',
    realEstateType: 'Departamentos',
    isRecommendation: false,
    url: `https://urbania.pe${slugFor(unit, postingId)}`,
    title: `Departamento en ${unit.district.name}`,
    description: null,
    priceAmount: inUsd ? Math.round(price / 3.75) : price,
    priceCurrency: inUsd ? 'USD' : 'PEN',
    priceIsFrom: false,
    pricePenShown: inUsd ? null : price,
    priceUsdShown: inUsd ? Math.round(price / 3.75) : null,
    priceFormatted: inUsd ? `US$ ${Math.round(price / 3.75)}` : `S/ ${price}`,
    maintenanceAmount: hash(unit.key) % 3 === 0 ? Math.round(areaM2 * 4) : null,
    maintenanceCurrency: hash(unit.key) % 3 === 0 ? 'PEN' : null,
    areaTotal: unit.omitArea ? null : areaM2,
    areaCovered: unit.omitArea ? null : Math.round(areaM2 * 0.92),
    bedrooms: unit.omitBedrooms ? null : unit.bedrooms,
    bathrooms: unit.bathrooms,
    halfBathrooms: null,
    parkingSpots: unit.parkingSpots,
    antiquityYears: unit.antiquityYears,
    features: [],
    areaMin: null,
    areaMax: null,
    bedroomsMin: null,
    bedroomsMax: null,
    unitsCount: null,
    developmentStage: null,
    deliveryDate: null,
    // The street number is what lets two listings of one apartment be recognised as
    // the same door.
    address: `${unit.street} ${unit.streetNumber}`,
    districtName: unit.district.name,
    subzoneName: null,
    cityName: 'Lima',
    locationId: `V1-D-${hash(unit.district.slug) % 100_000_000}`,
    latitude: unit.lat,
    longitude: unit.lon,
    publisherId: options.isDuplicate ? `${unit.publisherId}-b` : unit.publisherId,
    publisherName: options.isDuplicate ? 'Otra Inmobiliaria' : 'Inmobiliaria Seed',
    publisherTypeId: '2',
    status: 'ONLINE',
    modifiedDate: options.observedAt.toISOString(),
    firstDateOnline: reportsDate
      ? new Date(options.observedAt.getTime() - (week - createdWeek) * MS_PER_WEEK).toISOString()
      : null,
    hasDuplicate: options.isDuplicate ? true : null,
    imageUrl: null,
  };
}

/** Whether a listing is visible to the scraper in a given week. */
function isPresent(unit: Unit, week: number, isRepost: boolean): boolean {
  if (week < unit.fromWeek) return false;
  if (unit.goneWeeks.has(week)) return false;

  if (unit.repostWeek != null) {
    // The original disappears the week before the repost appears, which is what makes
    // it a repost and not a duplicate.
    return isRepost ? week >= unit.repostWeek : week < unit.repostWeek - 1;
  }
  if (isRepost) return false;

  if (unit.soldWeek != null && week >= unit.soldWeek) return false;
  return true;
}

async function main() {
  // Before any query: --reset deletes listings, favorites and notes.
  const database = assertSeedDatabase(process.env.DATABASE_URL);
  console.log(`Seed database: ${database}`);

  const args = process.argv.slice(2);
  const unitsArg = args.find((a) => a.startsWith('--units='))?.split('=')[1];
  const [saleUnits, rentUnits] = unitsArg
    ? unitsArg.split(',').map((n) => Number(n))
    : [200, 100];
  if (!(saleUnits > 0) || !(rentUnits > 0)) {
    throw new Error('--units necesita dos números mayores que 0, ej. --units=200,100');
  }
  const weeks = Number(args.find((a) => a.startsWith('--weeks='))?.split('=')[1] ?? 8);
  const reset = args.includes('--reset');
  /** The week the sanity gate is exercised, with one district nearly empty. */
  const brokenWeek = Math.max(2, weeks - 3);
  const brokenDistrict = DISTRICTS[0].slug;

  if (reset) {
    await prisma.posting.updateMany({ data: { currentSnapshotId: null } });
    await prisma.postingSnapshot.deleteMany();
    await prisma.duplicateCandidate.deleteMany();
    await prisma.duplicateDecision.deleteMany();
    await prisma.posting.deleteMany();
    await prisma.property.deleteMany();
    await prisma.project.deleteMany();
    await prisma.scrapeRun.deleteMany();
    console.log('Cleared listings, snapshots, duplicates, decisions, properties, projects and runs.');
  }

  // 10 districts × 200 sale + 100 rent by default (+ junk). --units=<sale>,<rent> overrides.
  const units = buildUnits({ weeks, saleUnitsPerDistrict: saleUnits, rentUnitsPerDistrict: rentUnits });
  console.log(`${units.length} synthetic apartments across ${DISTRICTS.length} districts, ${weeks} weekly runs.`);

  const now = Date.now();

  for (let week = 0; week < weeks; week++) {
    // Weekly runs ending at the present, so "possibly sold" and days-on-market have
    // a realistic timeline to work with.
    const startedAt = new Date(now - (weeks - 1 - week) * MS_PER_WEEK);
    const run = await prisma.scrapeRun.create({
      data: {
        mode: ScrapeMode.FULL_WEEKLY,
        status: ScrapeStatus.RUNNING,
        startedAt,
        notes: `synthetic week ${week}`,
      },
      select: { id: true },
    });

    const districtCounts: DistrictCounts = {};
    const skipped: string[] = [];

    for (const district of DISTRICTS) {
      for (const operation of [Operation.SALE, Operation.RENT] as const) {
        const cards: UrbaniaCardRaw[] = [];

        for (const unit of units) {
          if (unit.district.slug !== district.slug || unit.operation !== operation) continue;

          if (isPresent(unit, week, false)) {
            cards.push(makeCard({ unit, week, observedAt: startedAt, isRepost: false, isDuplicate: false }));
            if (unit.duplicateFromWeek != null && week >= unit.duplicateFromWeek) {
              cards.push(makeCard({ unit, week, observedAt: startedAt, isRepost: false, isDuplicate: true }));
            }
          }
          if (isPresent(unit, week, true)) {
            cards.push(makeCard({ unit, week, observedAt: startedAt, isRepost: true, isDuplicate: false }));
          }
        }

        // The broken run: the district returns almost nothing, as a dead parser does.
        const observed =
          week === brokenWeek && district.slug === brokenDistrict
            ? cards.slice(0, Math.max(1, Math.floor(cards.length * 0.04)))
            : cards;

        districtCounts[district.slug] ??= {};
        districtCounts[district.slug][operation] = observed.length;

        const { skip } = await shouldSkipDistrict('urbania', district.slug, operation, observed.length, run.id);
        if (skip) skipped.push(`${district.slug}:${operation}`);

        await ingestCards({
          runId: run.id,
          source: 'urbania',
          districtSlug: district.slug,
          operation,
          cards: observed.map((card) => fromUrbaniaCard(card, 'urbania', district.slug)),
          observedAt: startedAt,
          touchLastSeen: !skip,
        });
      }
    }

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: skipped.length ? ScrapeStatus.PARTIAL : ScrapeStatus.SUCCESS,
        finishedAt: new Date(startedAt.getTime() + 25 * 60_000),
        districtCounts: districtCounts as never,
        pagesFetched: 40,
        skippedDistricts: skipped,
        gitSha: 'seeded',
      },
    });

    const total = Object.values(districtCounts).reduce(
      (sum, ops) => sum + Object.values(ops).reduce((s, n) => s + (n ?? 0), 0),
      0
    );
    console.log(
      `  week ${String(week).padStart(2)}  ${String(total).padStart(5)} cards` +
        (skipped.length ? `  sanity gate held: ${skipped.join(', ')}` : '')
    );
  }

  await verify(units);
}

/**
 * Check that the model recovers the surface the data was generated from.
 *
 * This is the reason for a formula-based seed. A model that returns plausible numbers
 * on random data tells you nothing; one that recovers a known answer to within a few
 * percent is working.
 */
async function verify(units: readonly Unit[]) {
  console.log('\n--- verification ---');

  const [postings, snapshots, properties, multiListed] = await Promise.all([
    prisma.posting.count(),
    prisma.postingSnapshot.count(),
    prisma.property.count(),
    prisma.property.findMany({
      where: { postings: { some: {} } },
      select: { _count: { select: { postings: true } } },
    }),
  ]);
  const grouped = multiListed.filter((p) => p._count.postings > 1).length;
  console.log(
    `${postings} postings, ${snapshots} snapshots, ${properties} properties ` +
      `(${grouped} hold more than one listing: reposts and duplicates)`
  );
  console.log(
    `Snapshots per posting: ${(snapshots / postings).toFixed(2)} — one per run would be ${postings > 0 ? 16 : 0}.`
  );

  const saleRows = await prisma.posting.findMany({
    where: { operation: Operation.SALE, kind: PostingKind.UNIT },
    select: {
      districtSlug: true,
      currentSnapshot: {
        select: {
          pricePen: true,
          areaTotal: true,
          bedrooms: true,
          bathrooms: true,
          parkingSpots: true,
          antiquityYears: true,
          qualityFlags: true,
        },
      },
    },
  });

  const comparables: Comparable[] = [];
  for (const row of saleRows) {
    const s = row.currentSnapshot;
    if (!s?.pricePen || !s.areaTotal) continue;
    if (s.qualityFlags.length > 0) continue;
    comparables.push({
      districtSlug: row.districtSlug,
      pricePen: Number(s.pricePen),
      areaM2: Number(s.areaTotal),
      bedrooms: s.bedrooms,
      bathrooms: s.bathrooms,
      parkingSpots: s.parkingSpots,
      antiquityYears: s.antiquityYears,
      isNew: (s.antiquityYears ?? 99) <= 1,
    });
  }

  const model = fitFairPrice(comparables);
  if (!model) {
    console.log('Fair-price model: could not fit, which should not happen at this size.');
    return;
  }
  console.log(
    `Fair-price model: n=${model.n}, r2=${model.r2.toFixed(3)}, typical error ${(model.typicalErrorPct * 100).toFixed(1)}%`
  );

  // The known answer, for apartments the seed never generated exactly.
  let worst = 0;
  for (const district of DISTRICTS) {
    for (const areaM2 of [45, 70, 100]) {
      const bedrooms = areaM2 < 55 ? 1 : areaM2 < 85 ? 2 : 3;
      const truth = truePriceSale({
        salePerM2: district.salePerM2,
        areaM2,
        bedrooms,
        parkingSpots: 1,
        antiquityYears: 10,
        // The current week, since the fit sees the latest prices.
        week: 15,
      });
      const predicted = model.predict({
        districtSlug: district.slug,
        areaM2,
        bedrooms,
        bathrooms: bedrooms - 1,
        parkingSpots: 1,
        antiquityYears: 10,
        isNew: false,
      })!.expectedPen;
      const error = Math.abs(predicted - truth) / truth;
      worst = Math.max(worst, error);
      if (error > 0.1) {
        console.log(
          `  ${district.slug} ${areaM2}m2: predicted ${Math.round(predicted).toLocaleString()} ` +
            `against a true ${Math.round(truth).toLocaleString()} (${(error * 100).toFixed(1)}% off)`
        );
      }
    }
  }
  console.log(`Worst error against the known price surface: ${(worst * 100).toFixed(1)}%`);

  // Price per m² must fall with size, or the discount column is measuring size.
  // Bedrooms are held fixed on purpose: area and bedrooms are correlated in the seed,
  // as they are in reality, so varying both at once lets the bedroom premium cancel the
  // size discount and the check would report no effect where there is one.
  const held = { districtSlug: 'lince', bedrooms: 2, bathrooms: 1, parkingSpots: 0, antiquityYears: 10, isNew: false };
  const small = model.predict({ ...held, areaM2: 40 })!;
  const large = model.predict({ ...held, areaM2: 100 })!;
  console.log(
    `Price per m2 at 40m2 vs 100m2 in Lince: S/ ${Math.round(small.expectedPen / 40).toLocaleString()} vs ` +
      `S/ ${Math.round(large.expectedPen / 100).toLocaleString()} ` +
      (small.expectedPen / 40 > large.expectedPen / 100 ? '(falls with size, as it should)' : '(WRONG DIRECTION)')
  );

  const anchors = await prisma.posting.findMany({
    where: { firstSeenAt: { not: undefined } },
    select: { sourcePostingId: true, currentSnapshot: { select: { firstDateOnline: true } } },
  });
  const model2 = fitIdToDate(
    anchors.flatMap((a) =>
      a.currentSnapshot?.firstDateOnline
        ? [{ id: Number(a.sourcePostingId), publishedAt: a.currentSnapshot.firstDateOnline }]
        : []
    )
  );
  console.log(
    model2
      ? `Id-to-date model: n=${model2.n}, r2=${model2.r2.toFixed(3)}, typical error ${model2.medianErrorDays.toFixed(1)} days`
      : 'Id-to-date model: not enough anchors, as on a cold start.'
  );

  const flagged = await prisma.postingSnapshot.groupBy({
    by: ['qualityFlags'],
    _count: true,
    where: { qualityFlags: { isEmpty: false } },
  });
  console.log('Quality flags raised:');
  for (const group of flagged.sort((a, b) => b._count - a._count).slice(0, 8)) {
    console.log(`  ${group.qualityFlags.join(',').padEnd(40)} ${group._count}`);
  }

  await scoreMatcher(units);
  await countUglyCases();
}

/**
 * Score the property matcher against ground truth.
 *
 * The truth comes from the generator, not from any field in the database: posting ids
 * are a pure function of the unit, so regenerating them says which listings are really
 * the same apartment. Nothing observable is used, because every observable field is
 * exactly what the matcher is allowed to look at.
 *
 * This is the check an earlier scoring matcher would have failed loudly. It merged
 * twelve units of one building, which shows up here as one property holding twelve
 * apartments.
 */
async function scoreMatcher(units: readonly Unit[]) {
  const truth = new Map<string, string>();
  for (const unit of units) {
    for (const id of Object.values(unit.ids)) {
      if (id) truth.set(id, unit.key);
    }
  }

  const postings = await prisma.posting.findMany({
    select: { sourcePostingId: true, propertyId: true },
    where: { propertyId: { not: null } },
  });

  const propertiesPerUnit = new Map<string, Set<string>>();
  const unitsPerProperty = new Map<string, Set<string>>();
  for (const posting of postings) {
    const code = truth.get(posting.sourcePostingId);
    const property = posting.propertyId!;
    if (!code) continue;
    (propertiesPerUnit.get(code) ?? propertiesPerUnit.set(code, new Set()).get(code)!).add(property);
    (unitsPerProperty.get(property) ?? unitsPerProperty.set(property, new Set()).get(property)!).add(code);
  }

  // Split: one real apartment spread over several properties. Costs a duplicate row.
  const split = [...propertiesPerUnit.values()].filter((set) => set.size > 1).length;
  // Merge: several real apartments collapsed into one property. Destroys observations.
  const merged = [...unitsPerProperty.values()].filter((set) => set.size > 1).length;

  console.log('\nProperty matcher against ground truth:');
  console.log(`  ${propertiesPerUnit.size} real apartments, ${unitsPerProperty.size} properties`);
  console.log(`  ${split} apartments split across properties (a visible duplicate, recoverable)`);
  console.log(`  ${merged} properties merging distinct apartments (silent data loss)`);
  if (merged > 0) {
    for (const [property, codes] of unitsPerProperty) {
      if (codes.size > 1) {
        console.log(`    ${property} holds ${codes.size}: ${[...codes].slice(0, 4).join(', ')}`);
      }
    }
  }
}

/** Confirm the ugly cases are present, since they are the reason for the seed. */
async function countUglyCases() {
  const cutoffs = await possiblySoldCutoffs();

  const withHistory = await prisma.posting.findMany({
    select: {
      lastSeenAt: true,
      snapshots: {
        orderBy: { observedAt: 'asc' },
        select: { pricePen: true, priceCurrency: true, areaTotal: true },
      },
    },
  });

  let priceDrops = 0;
  let priceRises = 0;
  let currencyChanges = 0;
  for (const posting of withHistory) {
    const prices = posting.snapshots.map((s) => (s.pricePen == null ? null : Number(s.pricePen)));
    for (let i = 1; i < prices.length; i++) {
      const previous = prices[i - 1];
      const current = prices[i];
      if (previous == null || current == null) continue;
      if (current < previous * 0.999) priceDrops++;
      else if (current > previous * 1.001) priceRises++;
    }
    const currencies = new Set(posting.snapshots.map((s) => s.priceCurrency).filter(Boolean));
    if (currencies.size > 1) currencyChanges++;
  }

  const possiblySold = await prisma.posting.count({
    where: { removedAt: null, AND: [notLivePostingWhere(cutoffs)] },
  });
  const missingArea = await prisma.posting.count({
    where: { currentSnapshot: { areaTotal: null } },
  });
  // Multi-listed means two different publishers on one property, which is itself a
  // signal of a seller in a hurry.
  const grouped = await prisma.property.findMany({
    where: { postings: { some: {} } },
    select: { postings: { select: { currentSnapshot: { select: { publisherId: true } } } } },
  });
  const multiBroker = grouped.filter(
    (property) =>
      new Set(property.postings.map((p) => p.currentSnapshot?.publisherId).filter(Boolean)).size > 1
  ).length;

  console.log('\nUgly cases present:');
  console.log(`  ${priceDrops} observed price cuts, ${priceRises} rises (reposts reset the anchor upward)`);
  console.log(`  ${currencyChanges} listings that switched currency`);
  console.log(`  ${possiblySold} listings unseen for ${RUNS_BEFORE_POSSIBLY_SOLD} runs, so possibly sold`);
  console.log(`  ${missingArea} listings with no area at all`);
  console.log(`  ${multiBroker} properties listed by more than one broker`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
