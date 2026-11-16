# Multi-source Listings and Dedupe Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

Goal: Read listings from five sites plus manual entry, merge the copies of one apartment, and rank each apartment once at its lowest live price.

Architecture: Each site is an adapter that outputs one shared card type (`ListingCard`). The existing ingest writes every card through one dedupe step. Pure functions in `lib/` decide merges and flags, and thin Prisma code applies them. The listing loader collapses copies into one row per property.

Tech stack: TypeScript, Next.js 16, Prisma 7, Postgres, Playwright, cheerio, `node:test` with `tsx`.

Spec: `docs/superpowers/specs/2026-11-15-multi-source-dedupe-design.md`. Read it before you start a task.

## Global Constraints

- Free methods only. No paid scraping service and no proxy.
- Store only what was observed. Never delete a posting or a snapshot. Money columns stay `Decimal`.
- Price comparisons use soles, converted with `toPen` from `lib/money.ts`.
- All UI text is Spanish.
- The sanity gate ratio stays `SANITY_GATE_RATIO`, default `0.2`.
- A wrong merge is worse than a missed duplicate. When a rule is unsure, it flags.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass at the end of every task.
- Warning: `pnpm replay --reset` deletes data. Run every database step on a copy: `createdb -T <your_db> <your_db>_plan`, then set `DATABASE_URL` to the copy for that command.

## Review Focus

1. A USD copy and a PEN copy of one flat. The user expects one property, because prices compare in soles. Test: Task 3, `usd copy matches pen copy`.
2. A Proper or Nexo district name that is not in the Lima list, or has no accent ("Jesus Maria", "Cercado de Lima"). The user expects the card to be skipped and counted, not a crash. Tests: Task 1, `districtSlugFromName`, and Task 8, `skips units outside lima`.
3. A source that is blocked for a whole run and returns 0 cards. The user expects its listings to stay live. Test: Task 5, `gate skips when a source collapses to zero`.
4. Twelve units of one new building with only the street as address. The user expects LOW flags at most, never a merge. Tests: Task 3, `new building units never merge` and `different unit numbers never pair`.
5. A manual listing with no link and no address. The user expects it to save and to rank. Tests: Task 3, `null address gives no low flag`, and Task 13, `unit without link is valid`.

---

### Task 1: Shared card type and district names

Files:
- Create: `lib/listing-card.ts`
- Modify: `scraper/src/config/districts.ts`
- Test: `lib/listing-card.test.ts`, `scraper/src/config/districts.test.ts`

Interfaces:
- Produces:
  - `SOURCE_IDS = ['urbania','adondevivir','proper','nexo','remax','manual'] as const` and `type SourceId`.
  - `interface ListingCard extends UrbaniaCardRaw` with these added fields: `source: SourceId`, `districtSlug: string | null`, `buildingName: string | null`, `unitNumber: string | null`, `developerName: string | null`, `imageUrls: string[]`, `projectSourceId: string | null`, `raw: unknown`.
  - `emptyCard(source: SourceId, over: Partial<ListingCard>): ListingCard`. Every nullable field is null. `features` and `imageUrls` are `[]`. `isRecommendation` and `priceIsFrom` are false. `kind` is `'UNIT'`.
  - `fromUrbaniaCard(card: UrbaniaCardRaw, source: 'urbania' | 'adondevivir', districtSlug: string | null): ListingCard`. It copies a present `imageUrl` into `imageUrls` and sets `raw` to the input card.
  - `districtSlugFromName(name: string | null | undefined): string | null` in `districts.ts`.

- [ ] Step 1: Write the failing tests.

```ts
// scraper/src/config/districts.test.ts
it('districtSlugFromName', () => {
  assert.equal(districtSlugFromName('Jesús María'), 'jesus-maria');
  assert.equal(districtSlugFromName('jesus maria'), 'jesus-maria');
  assert.equal(districtSlugFromName('Santiago de Surco'), 'santiago-de-surco');
  assert.equal(districtSlugFromName('Surco'), 'santiago-de-surco');
  assert.equal(districtSlugFromName('Magdalena del Mar'), 'magdalena');
  assert.equal(districtSlugFromName('Cercado de Lima'), null);
  assert.equal(districtSlugFromName(''), null);
});
// lib/listing-card.test.ts
it('emptyCard fills nulls', () => {
  const c = emptyCard('proper', { priceAmount: 280000 });
  assert.equal(c.source, 'proper');
  assert.equal(c.address, null);
  assert.deepEqual(c.imageUrls, []);
  assert.equal(c.priceAmount, 280000);
});
it('fromUrbaniaCard keeps the image', () => {
  const c = fromUrbaniaCard({ ...emptyCard('urbania', {}), imageUrl: 'https://x/1.jpg' }, 'adondevivir', 'lince');
  assert.deepEqual(c.imageUrls, ['https://x/1.jpg']);
  assert.equal(c.source, 'adondevivir');
});
```

- [ ] Step 2: Run `node --import tsx --test lib/listing-card.test.ts scraper/src/config/districts.test.ts`. Expected: FAIL, because the modules do not export these names.
- [ ] Step 3: Implement the interfaces above. `districtSlugFromName` removes accents and lowercases. It maps the aliases `surco` to `santiago-de-surco` and `magdalena del mar` to `magdalena`. Then it matches against `LIMA_DISTRICT_SLUGS`, with spaces as hyphens.
- [ ] Step 4: Run the same command. Expected: PASS.
- [ ] Step 5: Commit: `git commit -m "feat: add shared listing card type and district name lookup"`.

### Task 2: Schema changes

Files:
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_multi_source/migration.sql` (generated)
- Create: `scripts/backfill-property-keys.ts`

Interfaces:
- Produces these Prisma changes. Later tasks use these exact names.
  - `enum DuplicateLevel { HIGH MEDIUM LOW }` and `enum DuplicateStatus { OPEN CONFIRMED REJECTED }`.
  - `Posting`: add `projectId String?` (relation to `Project`, `onDelete: SetNull`, indexed) and `removedAt DateTime?`.
  - `PostingSnapshot`: add `buildingName String?`, `unitNumber String?`, `developerName String?`, `imageUrls String[]`, `sourceUrl String?`.
  - `Property`: add `streetNorm String?`, `buildingNorm String?`, `unitNumber String?`, and `projectId String?` (relation, `onDelete: SetNull`, indexed). Add indexes on `streetNorm` and `buildingNorm`.
  - New `Project`. Identity fields: `id`, `districtSlug`, `name String?`, `nameNorm String?`, `developerName String?`, `addressNorm String?`. Other fields: `latitude` and `longitude` as `Decimal(10,7)?`, `deliveryDate String?`, `stage String?`, `sourceKeys String[]`, `createdAt`, `updatedAt`. A source key looks like `"proper:prolongacion-iquitos"`. Indexes on `districtSlug` and `nameNorm`.
  - New `DuplicateCandidate`: `id`, `propertyAId`, `propertyBId` (both relations to `Property`, `onDelete: Cascade`), `level DuplicateLevel`, `signals Json`, `status DuplicateStatus @default(OPEN)`, `createdAt`, `decidedAt DateTime?`. `@@unique([propertyAId, propertyBId])`. The code always stores the smaller id as A.
  - `ScrapeRun`: add `sources String[]`.
  - `scripts/backfill-property-keys.ts` fills `Property.streetNorm` from `addressNorm`, with digit tokens removed. Run it with `pnpm tsx --env-file-if-exists=.env scripts/backfill-property-keys.ts`.

- [ ] Step 1: Edit the schema as listed. Write a doc comment on each new model, in the style of the existing comments.
- [ ] Step 2: Run `pnpm db:migrate --name multi_source` on the copy database. Expected: the migration applies and `pnpm db:generate` succeeds.
- [ ] Step 3: Write the backfill script and run it on the copy. Expected: it prints the number of updated rows, and a second run prints 0.
- [ ] Step 4: Run `pnpm typecheck && pnpm test`. Expected: PASS.
- [ ] Step 5: Commit: `git commit -m "feat: schema for projects, duplicate candidates, and multi-source runs"`.

### Task 3: Pure dedupe rules

Files:
- Create: `lib/dedupe.ts`
- Test: `lib/dedupe.test.ts`

Interfaces:
- Consumes: `normalizeAddress`, `propertyMatch`, `distanceMetres` from `lib/fingerprint.ts`. `SourceId` from Task 1.
- Produces:
  - `type DuplicateLevel = 'HIGH' | 'MEDIUM' | 'LOW'`.
  - `interface DedupeSide { id: string; sources: SourceId[]; districtSlug: string; addressNorm: string | null; streetNorm: string | null; buildingNorm: string | null; unitNumber: string | null; developerNorm: string | null; titleNorm: string | null; bedrooms: number | null; areaM2: number | null; latitude: number | null; longitude: number | null; pricePen: number | null }`.
  - `streetNorm(address: string | null | undefined): string | null`. The result of `normalizeAddress`, without the tokens that contain a digit.
  - `nameNorm(name: string | null | undefined): string | null`. Lowercase, no accents, no punctuation, and without the words `edificio`, `residencial`, `proyecto`, `condominio`, `torre`.
  - `classifyPair(subject: DedupeSide, candidate: DedupeSide): { level: DuplicateLevel | null; signals: string[]; closeness: number }`.
  - `decideProperty(subject: DedupeSide, candidates: DedupeSide[]): { attachTo: string | null; flags: { propertyId: string; level: 'MEDIUM' | 'LOW'; signals: string[] }[] }`. It attaches to the HIGH candidate with the highest closeness. If no candidate is HIGH, it returns every MEDIUM and LOW candidate as a flag.
  - `pairKey(a: string, b: string): [string, string]`. Returns the two ids sorted.

The rules come in this order. All levels need the same `districtSlug`. If both sides have a `unitNumber` and the numbers differ, the result is null.

| Level | Signal name | Condition |
|---|---|---|
| HIGH | `navent-copy` | One side has `urbania` and the other has `adondevivir`. `titleNorm` is equal and not null. Prices differ by less than S/ 1. Areas differ by 0.5 m² or less. `addressNorm` is equal, and two nulls count as equal. |
| HIGH | `same-door` | `propertyMatch(...).same` is true. |
| HIGH | `same-unit` | `buildingNorm` is equal and not null. `unitNumber` is equal and not null. |
| MEDIUM | `same-building` or `same-developer` | `buildingNorm` or `developerNorm` is equal and not null. `bedrooms` is equal and not null. Areas are within 2 m². The price gap is 10% or less of the lower price. The distance is 150 m or less, or a side has no coordinates. |
| LOW | `same-street` | `streetNorm` is equal and not null. `bedrooms` is equal and not null. Areas are within 5 m². The price gap is 10% or less. |

`closeness` is `1 - priceGap` for HIGH, else 0. A null price gives no MEDIUM and no LOW.

- [ ] Step 1: Write the failing tests. Build sides with a helper `side(over)`. Its default is a Lince property with 2 bedrooms, 65 m², and S/ 399,000.

```ts
it('navent copy is high', ...)               // urbania vs adondevivir, same title, price, area, address → HIGH, signals ['navent-copy']
it('usd copy matches pen copy', ...)         // pricePen 399000 vs toPen(114000,'USD'), with door number → HIGH 'same-door'
it('same building and unit is high', ...)    // buildingNorm 'prolongacion iquitos', unitNumber '202' on both → HIGH
it('same building no unit is medium', ...)   // areas 65 and 66, prices 399000 and 405000 → MEDIUM 'same-building'
it('street only is low', ...)                // streetNorm equal, no number, areas 65 and 69 → LOW
it('price gap over 10% is nothing', ...)     // 399000 vs 445000, same building → null
it('publisher alone is nothing', ...)        // only the publisher is shared → null
it('different unit numbers never pair', ...) // same building, unit '202' vs '305' → null
it('new building units never merge', ...)    // 12 units, street address only, 52 to 59 m², 494000 to 535000: no pair is HIGH
it('null address gives no low flag', ...)    // addressNorm and streetNorm null on both → null
it('decideProperty attaches to the closest high', ...)
it('decideProperty returns flags when no high', ...)
it('pairKey is order free', () => assert.deepEqual(pairKey('b', 'a'), pairKey('a', 'b')));
```

- [ ] Step 2: Run `node --import tsx --test lib/dedupe.test.ts`. Expected: FAIL, because the module does not exist.
- [ ] Step 3: Implement the interfaces and the table above in `lib/dedupe.ts`.
- [ ] Step 4: Run the same command. Expected: PASS. Run `pnpm test`. Expected: the old `fingerprint` tests also pass.
- [ ] Step 5: Commit: `git commit -m "feat: dedupe levels for cross-source matching"`.

### Task 4: Pure project matching

Files:
- Create: `lib/project-match.ts`
- Test: `lib/project-match.test.ts`

Interfaces:
- Consumes: `nameNorm` from Task 3, `distanceMetres` from `lib/fingerprint.ts`.
- Produces: `interface ProjectSide { districtSlug: string; nameNorm: string | null; addressNorm: string | null; latitude: number | null; longitude: number | null }` and `sameProject(a: ProjectSide, b: ProjectSide): boolean`.

Rule: the district is the same, and one of these is true:

- `nameNorm` is equal and not null.
- `addressNorm` is equal and contains a digit.
- The distance is 30 m or less, and the two names share at least half of the tokens of the shorter name.

- [ ] Step 1: Write the failing tests: `same name links`, `same numbered address links`, `close and similar name links`, `close but different name stays apart`, `other district stays apart`.
- [ ] Step 2: Run `node --import tsx --test lib/project-match.test.ts`. Expected: FAIL.
- [ ] Step 3: Implement `sameProject`.
- [ ] Step 4: Run the same command. Expected: PASS.
- [ ] Step 5: Commit: `git commit -m "feat: project matching across sources"`.

### Task 5: Multi-source ingest and sanity gate

Files:
- Modify: `scraper/src/db/ingest.ts`
- Create: `lib/sanity-gate.ts`
- Test: `lib/sanity-gate.test.ts`

Interfaces:
- Consumes: `ListingCard` (Task 1), the schema (Task 2), `decideProperty`, `streetNorm`, `nameNorm`, `pairKey` (Task 3), `sameProject` (Task 4).
- Produces:
  - `previousCountFrom(counts: unknown, source: SourceId, district: string, operation: 'SALE' | 'RENT'): number | null`. The new shape is `{ [source]: { [district]: { SALE?, RENT? } } }`. The old shape `{ [district]: {...} }` counts as `urbania` only.
  - `gateSkips(observed: number, previous: number | null, ratio: number): boolean`. It returns `previous > 0 && observed < previous * ratio`.
  - `type SourceDistrictCounts = Record<string, Record<string, Partial<Record<'SALE' | 'RENT', number>>>>`.
  - `shouldSkipDistrict(source: SourceId, districtSlug: string, operation: Operation, observedCount: number, currentRunId: string)`, with the same return type as today. The previous run is the newest SUCCESS or PARTIAL run whose `sources` contains `source`. For `urbania`, a run with empty `sources` also counts.
  - `startRun(input: { mode; gitSha; sources: SourceId[] })`.
  - `ingestCards(input: { runId; source: SourceId; districtSlug; operation; cards: ListingCard[]; observedAt?; touchLastSeen? }): Promise<IngestResult>`. It uses `input.source` in the posting key. It writes the five new snapshot fields, with `sourceUrl` from `card.url`. It stores `card.raw ?? card` in `rawCard`.
  - A new posting of kind `PROJECT` resolves a `Project`. It looks first for `sourceKeys has "<source>:<sourcePostingId>"`, then for `sameProject` against the projects of the district, and else it creates one. It adds the source key and sets `Posting.projectId`.
  - A new `UNIT` posting resolves its property with `decideProperty`. Candidates come from the current query, plus matches on `streetNorm` and `buildingNorm`. If `attachTo` is null, ingest creates a property with the new keys. Its `projectId` comes from `sourceKeys has "<source>:<projectSourceId>"`. Then ingest writes each flag with `createMany({ skipDuplicates: true })`, with ids ordered by `pairKey`.
  - `refreshManualPostings(observedAt: Date): Promise<number>`. It sets `lastSeenAt` on postings with `source = 'manual'` and `removedAt = null`.

- [ ] Step 1: Write the failing tests in `lib/sanity-gate.test.ts`.

```ts
it('reads the new shape', ...)        // {remax:{lince:{SALE:40}}} → 40 for remax/lince/SALE
it('old shape is urbania only', ...)  // {lince:{SALE:281}} → 281 for urbania, null for adondevivir
it('gate skips when a source collapses to zero', () => assert.equal(gateSkips(0, 281, 0.2), true));
it('gate passes a normal run', () => assert.equal(gateSkips(270, 281, 0.2), false));
it('gate passes the first run', () => assert.equal(gateSkips(0, null, 0.2), false));
```

- [ ] Step 2: Run `node --import tsx --test lib/sanity-gate.test.ts`. Expected: FAIL.
- [ ] Step 3: Implement `lib/sanity-gate.ts`, then change `ingest.ts` as listed. Replace every `'urbania'` literal with `input.source`.
- [ ] Step 4: `scraper/src/index.ts` and `replay.ts` fail typecheck until Task 6. Convert their calls with `fromUrbaniaCard(card, 'urbania', districtSlug)` and `source: 'urbania'`. Run `pnpm test && pnpm typecheck`. Expected: PASS.
- [ ] Step 5: On the copy database, run `pnpm replay --reset data/runs/*.ndjson`. Expected: the same posting count as before the change, and no `DuplicateCandidate` row with level HIGH, because HIGH merges and never writes a candidate.
- [ ] Step 6: Commit: `git commit -m "feat: multi-source ingest with dedupe levels and per-source sanity gate"`.

### Task 6: Adapter contract and scrape loop

Files:
- Create: `scraper/src/sources/types.ts`, `scraper/src/sources/urbania.ts`, `scraper/src/sources/registry.ts`
- Modify: `scraper/src/index.ts`, `scraper/src/replay.ts`, `scraper/src/utils/file-utils.ts`

Interfaces:
- Produces:

```ts
export interface SourceBatch { districtSlug: string; cards: ListingCard[] }
export interface SourceDistrictResult { districtSlug: string; pagesFetched: number; blocked: boolean; errors: string[]; claimedTotal: number | null }
export interface SourceCrawlResult { districts: SourceDistrictResult[]; skippedOutsideLima: number }
export interface SourceAdapter {
  id: SourceId;
  operations: Operation[];
  crawl(opts: { districts: string[]; operation: Operation; onBatch: (b: SourceBatch) => Promise<void> }): Promise<SourceCrawlResult>;
}
```

  - `registry.ts` exports `ADAPTERS: Partial<Record<Exclude<SourceId, 'manual'>, () => SourceAdapter>>`. Tasks 7 to 10 add their entries.
  - `urbania.ts` wraps the existing `UrbaniaScraper` and maps its cards with `fromUrbaniaCard`.
  - `pnpm scrape` takes `--sources=a,b`. The default is every adapter in the registry.
  - The loop runs each adapter for each of its operations. It writes NDJSON per source and operation with the existing sink, gates per source and district, and ingests. It records counts as `SourceDistrictCounts` and sets `sources` on the run.
  - After the loop, it calls `refreshManualPostings`.
  - If one adapter fails, the loop records the error in `errors` and continues with the next adapter.
  - `replay.ts` reads `card.source`. Old files without it count as `urbania`.

- [ ] Step 1: Write the contract and the Urbania adapter. Move the per-district loop body from `index.ts` into a function `runSource(adapter, run, opts)`.
- [ ] Step 2: Run `pnpm typecheck && pnpm test`. Expected: PASS.
- [ ] Step 3: Run `pnpm scrape --sources=urbania --districts=lince --operations=sale --dry-run`. Expected: the same per-district health lines as before, and no database writes.
- [ ] Step 4: Commit: `git commit -m "refactor: source adapter contract and multi-source scrape loop"`.

### Task 7: Navent JSON adapter (Urbania and Adondevivir)

Files:
- Create: `scraper/src/sources/navent/client.ts`, `scraper/src/sources/navent/parse.ts`, `scraper/src/sources/navent/adapter.ts`, and captured files in `scraper/src/sources/navent/__fixtures__/`
- Modify: `scraper/src/utils/browser-fetch.ts`, `scraper/src/scrapers/urbania/parse-preloaded-state.ts`, `scraper/src/sources/registry.ts`
- Test: `scraper/src/sources/navent/parse.test.ts`

Interfaces:
- Consumes: `SourceAdapter` (Task 6), `fromUrbaniaCard` (Task 1).
- Produces:
  - `BrowserSession.postJson<T>(url: string, body: unknown): Promise<T>`. `createBrowserSession` reads `SCRAPER_HEADLESS`. The default is headed, as the README says.
  - `mapPosting`, exported from `parse-preloaded-state.ts`, with no change in behavior.
  - `parseNaventPostings(json: unknown, baseUrl: string, source: 'urbania' | 'adondevivir', districtSlug: string): { cards: ListingCard[]; totalResults: number | null; totalPages: number | null }`.
  - `naventAdapter(source: 'urbania' | 'adondevivir'): SourceAdapter`. The base URLs are `https://urbania.pe` and `https://www.adondevivir.com`. It pages until `totalPages`. If the JSON call fails for an Urbania district, it falls back to the existing HTML crawler for that district.
  - The registry maps `urbania` and `adondevivir` to `naventAdapter`.

- [ ] Step 1: In a real browser, open the Lince sale search on each site. Save one `POST /rplis-api/postings` request body and its response as `__fixtures__/urbania-lince-p1.request.json` and `urbania-lince-p1.response.json`. Do the same for `adondevivir`. In a comment in `client.ts`, write which body fields select the district, the page, and the operation.
- [ ] Step 2: Write the failing tests.

```ts
it('parses the urbania page', ...)      // cards.length equals the count in the fixture; the first card has sourcePostingId, priceAmount, source 'urbania'
it('parses the adondevivir page', ...)  // the same, with source 'adondevivir'
it('finds a copy on both sites', ...)   // at least one title appears in both fixtures, for example "Av. Prol. Iquitos 1766"
```

- [ ] Step 3: Run `node --import tsx --test scraper/src/sources/navent/parse.test.ts`. Expected: FAIL.
- [ ] Step 4: Implement `postJson`, export `mapPosting`, and write the parser, client, and adapter.
- [ ] Step 5: Run the tests. Expected: PASS. Then run `pnpm scrape --sources=adondevivir --districts=lince --operations=sale --dry-run`. Expected: about the count that the site shows (299 on 2026-11-14).
- [ ] Step 6: Commit: `git commit -m "feat: Navent JSON adapter for Urbania and Adondevivir"`.

### Task 8: Proper adapter

Files:
- Create: `scraper/src/sources/proper/parse.ts`, `scraper/src/sources/proper/adapter.ts`, and fixtures in `scraper/src/sources/proper/__fixtures__/`
- Modify: `scraper/src/sources/registry.ts`
- Test: `scraper/src/sources/proper/parse.test.ts`

Interfaces:
- Consumes: `emptyCard`, `districtSlugFromName` (Task 1), `SourceAdapter` (Task 6).
- Produces:
  - `parseProperBuildId(html: string): string | null`. It reads `buildId` from `__NEXT_DATA__`.
  - `parseProperProject(json: unknown, slug: string): ListingCard[]`. The project card comes first in the array.
    - One `PROJECT` card: `sourcePostingId = slug`, `priceIsFrom = true`, `buildingName`, the area and bedroom ranges, `deliveryDate`, `developmentStage`, and coordinates.
    - One `UNIT` card per item in `departamentos`: `sourcePostingId = "<slug>-<id>"`, `unitNumber = nro_depa`, `projectSourceId = slug`, `buildingName`, the price in `tipo_moneda`, `areaTotal = unit_area`, bedrooms, bathrooms, and `url = https://inversiones.proper.com.pe/proyecto/<slug>`.
  - `properAdapter(): SourceAdapter`, with operations `['SALE']`.
    - It fetches `https://3nors0yi4b.execute-api.us-east-2.amazonaws.com/production/get_proyects_departments/`.
    - It reads the build id from `https://inversiones.proper.com.pe/propiedades`.
    - It fetches each project from `/_next/data/<buildId>/proyecto/<slug>.json?slug=<slug>`, with 1 to 3 s between requests.
    - It ignores the `districts` filter. It maps `distrito` with `districtSlugFromName` and counts the cards outside Lima in `skippedOutsideLima`.

- [ ] Step 1: Save the list response and the `santa-beatriz` project response as fixtures with `curl`. Find which of `coordenada_A` and `coordenada_B` is the latitude. The latitude of Lima is about -12.
- [ ] Step 2: Write the failing tests.
  - `parses the project and its units`: 9 units for `santa-beatriz` in the 2026-11-14 data. The first unit is `202`, at S/ 280,000 and 34 m².
  - `project card comes first`.
  - `skips units outside lima`: the `cercado de lima` project gives `districtSlug` null.
- [ ] Step 3: Run `node --import tsx --test scraper/src/sources/proper/parse.test.ts`. Expected: FAIL.
- [ ] Step 4: Implement the parser and the adapter.
- [ ] Step 5: Run the tests. Expected: PASS. Run `pnpm scrape --sources=proper --operations=sale --dry-run`. Expected: about 49 projects, with unit counts per district.
- [ ] Step 6: Commit: `git commit -m "feat: Proper adapter with unit-level prices"`.

### Task 9: Nexo adapter

Files:
- Create: `scraper/src/sources/nexo/parse.ts`, `scraper/src/sources/nexo/adapter.ts`, and fixtures in `scraper/src/sources/nexo/__fixtures__/`
- Modify: `scraper/src/sources/registry.ts`
- Test: `scraper/src/sources/nexo/parse.test.ts`

Interfaces:
- Consumes: `emptyCard`, `districtSlugFromName` (Task 1), `SourceAdapter` (Task 6).
- Produces:
  - `parseNexoListPage(html: string): { cards: ListingCard[]; nextPageUrl: string | null }`. It reads the JSON-LD `ItemList` first, and it uses cheerio on the cards for the fields that JSON-LD does not have.
    - Each card is a `PROJECT` with `priceIsFrom = true`, `buildingName`, `developerName`, `address`, the area and bedroom ranges, `developmentStage`, and `url`.
    - `sourcePostingId` is the project slug from its URL.
  - `nexoAdapter(): SourceAdapter`, with operations `['SALE']`. It uses plain `fetch` with a browser user agent and waits 1 to 3 s between pages. It maps the district part of the address with `districtSlugFromName`.

- [ ] Step 1: Save page 1 and page 2 of `https://nexoinmobiliario.pe/departamentos` as fixtures. Find how paging works (a link, a query parameter, or a POST) and write it in a comment in `adapter.ts`. Open one project page. In the same comment, write yes or no for unit prices on that page. This plan reads projects only.
- [ ] Step 2: Write the failing tests.
  - `parses 24 cards on page 1`: the JSON-LD `numberOfItems` was 24 on 2026-11-14.
  - `reads developer and address`: for example `Albamar` and `Av. Chorrillos 396`.
  - `finds the next page`.
- [ ] Step 3: Run `node --import tsx --test scraper/src/sources/nexo/parse.test.ts`. Expected: FAIL.
- [ ] Step 4: Implement the parser and the adapter.
- [ ] Step 5: Run the tests. Expected: PASS. Run `pnpm scrape --sources=nexo --operations=sale --dry-run`. Expected: project counts per Lima district.
- [ ] Step 6: Commit: `git commit -m "feat: Nexo adapter for new projects"`.

### Task 10: Remax adapter

Files:
- Create: `scraper/src/sources/remax/parse.ts`, `scraper/src/sources/remax/adapter.ts`, and fixtures in `scraper/src/sources/remax/__fixtures__/`
- Modify: `scraper/src/sources/registry.ts`
- Test: `scraper/src/sources/remax/parse.test.ts`

Interfaces:
- Consumes: `emptyCard` (Task 1), `SourceAdapter` (Task 6), and the browser launch pattern in `scraper/src/utils/browser-loader.ts`.
- Produces:
  - `parseRemaxListPage(html: string): { cards: ListingCard[]; nextPageUrl: string | null }`. It gives `UNIT` cards. The Remax id on the card (for example `ID: 1193424`) is the `sourcePostingId`. Other fields: price, currency, area, bedrooms, bathrooms, address, image, and `url`.
  - `remaxAdapter(): SourceAdapter`, with operations `['SALE', 'RENT']`.
    - A headed Playwright page loads `https://www.remax.pe/` and waits until the title is not "Just a moment...".
    - Then it loads the apartment search list for each district.
    - If the challenge page stays for 30 s, it marks the district `blocked`. The code never clicks a challenge.

- [ ] Step 1: From a real browser, save one search result page for Lince apartments for sale as a fixture. Write the search URL pattern in a comment in `adapter.ts`.
- [ ] Step 2: Write the failing tests.
  - `parses the cards`: the count equals the cards in the fixture, and each card has `sourcePostingId` and `priceAmount`.
  - `reads currency`: a `US$` price gives `USD`.
  - `finds the next page`.
- [ ] Step 3: Run `node --import tsx --test scraper/src/sources/remax/parse.test.ts`. Expected: FAIL.
- [ ] Step 4: Implement the parser and the adapter.
- [ ] Step 5: Run the tests. Expected: PASS. Run `pnpm scrape --sources=remax --districts=lince --operations=sale --dry-run`. Expected: a card count for Lince, and no `BLOCKED`.
- [ ] Step 6: Commit: `git commit -m "feat: Remax adapter"`.

### Task 11: Official price and copies in the listing rows

Files:
- Create: `lib/official-price.ts`
- Modify: `lib/listing-row.ts`, `lib/listings.ts`, `lib/market.ts`, `lib/departamentos-query.ts`, `lib/departamentos-search-params.ts`
- Test: `lib/official-price.test.ts`, `lib/departamentos-query.test.ts`

Interfaces:
- Consumes: the schema (Task 2), `SourceId` (Task 1).
- Produces:
  - `interface CopyInput { postingId: string; propertyId: string | null; source: SourceId; url: string | null; pricePen: number }`.
  - `interface ListingCopy { source: SourceId; url: string | null; pricePen: number }`.
  - `collapseCopies(rows: CopyInput[]): Map<string, { copies: ListingCopy[]; priceMaxPen: number }>`.
    - The key is the official posting id: the lowest `pricePen` in each property. On a tie, the smaller `postingId` wins.
    - A row without `propertyId` is its own group.
    - `copies` is sorted by price, lowest first.
  - `postingUrl(source: SourceId, sourcePath: string | null, sourceUrl: string | null): string | null`. It returns `sourceUrl` first. For `urbania` without it, it returns `https://urbania.pe` plus `sourcePath`.
  - `ListingRow` gains `source: SourceId`, `copies: ListingCopy[]`, `priceMaxPen: number`, `url: string | null`, and `duplicateFlags: { candidateId: string; level: 'MEDIUM' | 'LOW'; otherPropertyId: string }[]`. `listingCount` becomes `copies.length`.
  - `loadSaleListings` returns only official rows. It loads the `OPEN` duplicate candidates for the returned property ids.
  - In `market.ts`, the fair-price model and the rent index use one row per property, through `collapseCopies`.
  - The `queryDepartamentos` input gains `sources: SourceId[]`, where empty means all. The filter keeps each row that has at least one copy from a listed source. The URL parameter is `fuentes`, comma separated, in the pattern of `departamentos-search-params.ts`.

- [ ] Step 1: Write the failing tests.

```ts
it('lowest price is official', ...)        // property P: urbania 420000, remax 399000, proper 410000 → key is the remax posting, priceMaxPen 420000, 3 copies in price order
it('tie picks the smaller posting id', ...)
it('no property means its own row', ...)
it('urbania url from path', () => assert.equal(postingUrl('urbania', '/inmueble/x-1', null), 'https://urbania.pe/inmueble/x-1'));
// lib/departamentos-query.test.ts
it('filters by source', ...)               // sources ['remax'] keeps only rows with a remax copy
```

- [ ] Step 2: Run `node --import tsx --test lib/official-price.test.ts lib/departamentos-query.test.ts`. Expected: FAIL.
- [ ] Step 3: Implement the interfaces, and use them in `listings.ts`, `market.ts`, and `departamentos-query.ts`.
- [ ] Step 4: Run `pnpm test && pnpm typecheck`. Expected: PASS.
- [ ] Step 5: Commit: `git commit -m "feat: one row per property at the lowest live price"`.

### Task 12: Duplicate review in the table

Files:
- Create: `lib/duplicates.ts`
- Modify: `app/actions.ts`, `app/departamentos/departamentos-table.tsx`, `app/departamentos/departamentos-unified-client.tsx`
- Test: `lib/duplicates.test.ts`

Interfaces:
- Consumes: the `ListingRow` fields from Task 11, `pairKey` from Task 3.
- Produces:
  - `type Annotations = { favorite: boolean; discarded: boolean; discardReason: string | null; notes: string | null }`.
  - `mergeAnnotations(a: Annotations, b: Annotations): Annotations`. Favorite is `a || b`. Discarded is `a && b`. Notes are joined with `"\n---\n"`, without empty parts. The discard reason of the kept property wins.
  - `confirmDuplicate(candidateId: string): Promise<void>`.
    - It keeps the older property (the earlier `createdAt`) and moves all postings to it.
    - It applies `mergeAnnotations`.
    - It repoints the other candidates of the removed property, and deletes candidates that become self-pairs or duplicates.
    - It deletes the removed property and sets the candidate to `CONFIRMED` with `decidedAt`.
  - `rejectDuplicate(candidateId: string): Promise<void>`. It sets `REJECTED` and `decidedAt`.
  - `splitPosting(postingId: string): Promise<void>`. It works only for a property with more than one posting. It creates a property from the keys of the current snapshot, moves the posting, and writes a `REJECTED` candidate for the pair.
  - Server actions in `app/actions.ts` with the same three names. Each calls `revalidateTag('sale-listings')`, as the existing actions do.
  - Table UI, with this exact Spanish copy:
    - The copies line `"{n} fuentes · S/ {min} a S/ {max}"`, with one link per copy, labeled with the source name.
    - The badge `"posible duplicado (media)"` or `"posible duplicado (baja)"`, with the buttons `"es el mismo"` and `"no es el mismo"`.
    - On a row with more than one copy, a `"no es el mismo"` item per copy that calls `splitPosting`.
    - A `"Fuente"` multi-select filter bound to `fuentes`.
  - `scripts/export-duplicate-decisions.ts`. It writes every `CONFIRMED` and `REJECTED` pair as two `DedupeSide` values plus the status to `lib/__fixtures__/duplicate-decisions.json`.
  - A test in `lib/dedupe.test.ts`, `owner decisions still hold`. If that file exists, the test reads it. For a pair with status `CONFIRMED`, `classifyPair` is not null. For a pair with status `REJECTED`, it is not HIGH. With no file, the test passes.

- [ ] Step 1: Write the failing tests for `mergeAnnotations`: `favorite survives`, `visible wins over discarded`, `notes join without blanks`. Add `owner decisions still hold` with a small fixture of one `CONFIRMED` pair and one `REJECTED` pair.
- [ ] Step 2: Run `node --import tsx --test lib/duplicates.test.ts`. Expected: FAIL.
- [ ] Step 3: Implement `lib/duplicates.ts`, the actions, and the UI.
- [ ] Step 4: Run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] Step 5: On the copy database, run `pnpm build && pnpm start` and open `/departamentos`. Click "es el mismo" on one flag, "no es el mismo" on another flag, and split one copy. Expected: the row count changes as each action says. A rejected pair does not come back after `pnpm replay`.
- [ ] Step 6: Commit: `git commit -m "feat: review possible duplicates from the table"`.

### Task 13: Manual entry

Files:
- Create: `lib/manual-listing.ts`, `app/agregar/page.tsx`, `app/agregar/agregar-form.tsx`, `app/agregar/actions.ts`
- Modify: `components/top-bar.tsx`, `app/actions.ts`
- Test: `lib/manual-listing.test.ts`

Interfaces:
- Consumes: `emptyCard`, `districtSlugFromName` (Task 1), `startRun`, `ingestCards`, `finishRun` (Task 5).
- Produces:
  - `validateManualListing(raw: unknown, newId: () => string): { ok: true; districtSlug: string; operation: 'SALE' | 'RENT'; cards: ListingCard[] } | { ok: false; errors: Record<string, string> }`.
    - Unit mode. Required: `price`, `currency`, `operation`, `district`, `bedrooms`, `area`. Optional: `link`, `address`, `buildingName`, `unitNumber`, `publisher`, `bathrooms`, `parkingSpots`, `photoUrls`, `notes`.
    - Project mode. Required: `project.name`, `project.district`, and at least one unit with `price`, `currency`, `bedrooms`, `area`. Optional project fields: `developer`, `address`, `deliveryDate`, `stage`, `link`, `notes`. Optional unit fields: `unitNumber`, `bathrooms`, `parkingSpots`. The operation is `SALE`.
    - Cards have `source: 'manual'` and `sourcePostingId = "m-" + newId()`. In project mode, the project card comes first, and each unit has `projectSourceId` set to the project id.
    - Error messages, exact: `"Requerido"`, `"Debe ser un número mayor que 0"`, `"Distrito no válido"`, `"Agrega al menos una unidad"`.
  - `createManualListing(raw: unknown): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }>` in `app/agregar/actions.ts`. It starts a `MANUAL` run with `sources: ['manual']`, ingests, finishes the run as `SUCCESS`, and revalidates `sale-listings`.
  - `markManualRemoved(postingId: string): Promise<void>` in `app/actions.ts`. It sets `removedAt` on a `manual` posting. The table shows a `"marcar vendido o retirado"` action on rows whose official copy is manual.
  - The `/agregar` page has the title `"Agregar aviso"` and a toggle `"Unidad"` or `"Proyecto"`. The top bar gets a link `"Agregar"`.

- [ ] Step 1: Write the failing tests.

```ts
it('unit without link is valid', ...)            // only price, currency, operation, district, bedrooms, area → ok, 1 card, url null
it('unit missing area is an error', ...)         // errors.area === 'Requerido'
it('negative price is an error', ...)            // errors.price === 'Debe ser un número mayor que 0'
it('unknown district is an error', ...)          // 'Cercado de Lima' → errors.district === 'Distrito no válido'
it('project gives project card then units', ...) // 2 units → 3 cards, the first is kind PROJECT, units carry projectSourceId
it('project without units is an error', ...)     // errors.units === 'Agrega al menos una unidad'
```

- [ ] Step 2: Run `node --import tsx --test lib/manual-listing.test.ts`. Expected: FAIL.
- [ ] Step 3: Implement the validator, the action, the form, and the top bar link.
- [ ] Step 4: Run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] Step 5: On the copy database, add one unit, and one project with two units, through `/agregar`. Expected: three new rows in `/departamentos`, each with source `manual`. Mark one as removed. Expected: it stays in the table until the next scrape run, and then it leaves.
- [ ] Step 6: Commit: `git commit -m "feat: manual entry for units and projects"`.

### Task 14: Runs page per source and README

Files:
- Modify: `app/runs/page.tsx`, `app/runs/runs-client.tsx`, `README.md`

Interfaces:
- Consumes: `previousCountFrom` and `SourceDistrictCounts` (Task 5).
- Produces:
  - `/runs` shows one count table per source for each run. Old runs show under `urbania`.
  - The README documents the sources, the `--sources` flag, the manual entry page, and the dedupe levels. The line "Multi-fuente (Nexo, Infocasas)" leaves the out-of-scope section.

- [ ] Step 1: Change the runs page to read counts through `previousCountFrom`, for each source in `run.sources`, or `urbania` for old runs.
- [ ] Step 2: Update the README in Spanish, in the style of the current file.
- [ ] Step 3: Run `pnpm typecheck && pnpm lint && pnpm test`. Expected: PASS.
- [ ] Step 4: On the copy database, run `pnpm scrape --districts=lince --operations=sale` with all sources, then open `/runs`. Expected: one table per source, and no source marked as skipped.
- [ ] Step 5: Commit: `git commit -m "docs: runs per source and README for multi-source"`.
