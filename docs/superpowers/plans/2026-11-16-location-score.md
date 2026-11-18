# Location Score and Local Rent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each Lima apartment gets a stored location score from 0 to 10 with reasons. The owner rates zones on `/zonas`. The rent estimate uses nearby rent listings.

**Architecture:** Pure math lives in `lib/location/` (geometry, zones, local rent, score). A refresh step loads places, zones, district stats, and rent listings from Postgres, computes every tracked apartment, and writes `PropertyLocation` rows. The scrape and each zone save run the refresh. The table reads the stored rows.

**Tech Stack:** Next.js 16, React, nuqs, Prisma 7, Postgres, node:test with tsx. No PostGIS. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-location-score-design.md`

## Global Constraints

- All UI text is in Spanish. Free sources only. No new npm dependencies.
- Distances use haversine in TypeScript. No PostGIS.
- A page load never calls an outside service. Overpass is called only by `pnpm location:places`, in one request.
- Lima is the 43 districts of the province of Lima. Callao is out.
- Livability radius: 500 m. Rent and demand radius: 1 km.
- Zone reach: 1 inside, falls in a straight line to 0 at 500 m from the edge. Zone weight = 0.6 × reach. Highest reach wins, a tie goes to the smaller zone.
- Local rent: same bedroom group, within 1 km, 15 nearest, at least 8, middle = median per m², high end = 75th percentile per m².
- Score = round to one decimal of (0.5 × livability + 0.5 × demand). Parts use percentiles among tracked apartments. The score is not ranked again.
- Tracked apartments: active sale UNIT properties in Lima with coordinates.
- Default point zone radius: 400 m.
- The money numbers never use the high end.
- Never touch the database `dptos`. Use `dptos_seed` or `dptos_plan` with a shell `DATABASE_URL`.

## Review Focus

1. Rent listings with no coordinates, or a database with almost no rent listings: every apartment falls back to the district median, the table says so, and nothing crashes. (Task 2 and Task 6 tests.)
2. An apartment exactly on a zone edge, or inside two zones of the same reach: reach 1, smaller zone wins, no division by zero for a zero-area polygon. (Task 1 tests.)
3. A low-rated zone next to an apartment lowers its livability below the place-count part. (Task 3 test.)
4. A Google Maps link the parser does not know, or coordinates outside Lima: the form shows a Spanish error and saves nothing. (Task 8 tests.)
5. A district stats row with an unknown slug or a non-numeric cell: the refresh stops with a clear error instead of storing NaN. (Task 4 test.)

---

### Task 1: Geometry and zones

**Files:**
- Create: `lib/location/geo.ts`, `lib/location/zones.ts`, `lib/location/lima-districts.ts`
- Test: `lib/location/geo.test.ts`, `lib/location/zones.test.ts`, `lib/location/lima-districts.test.ts`

**Interfaces:**
- Produces:
  - `type LatLon = { lat: number; lon: number }`
  - `type Ring = [lon: number, lat: number][]`
  - `haversineM(a: LatLon, b: LatLon): number`
  - `pointInPolygon(p: LatLon, rings: Ring[]): boolean` (even-odd over all rings)
  - `distanceToPolygonEdgeM(p: LatLon, rings: Ring[]): number`. It returns 0 inside the polygon and uses a local equirectangular projection.
  - `polygonAreaM2(rings: Ring[]): number`
  - `class GridIndex<T extends LatLon> { constructor(items: T[], cellDeg?: number); near(p: LatLon, radiusM: number): { item: T; distanceM: number }[] }` (default cell 0.01°, result sorted by distance)
  - `type ZoneShape = { id: string; name: string; rating: number } & ({ kind: 'CIRCLE'; lat: number; lon: number; radiusM: number } | { kind: 'DISTRICT'; districtSlug: string; rings: Ring[] })`
  - `zoneReach(p: LatLon, zone: ZoneShape): { reach: number; distanceToEdgeM: number }`
  - `pickZone(p: LatLon, zones: ZoneShape[]): { zone: ZoneShape; reach: number; distanceToEdgeM: number } | null`. If no zone reaches the point, it returns null.
  - `ZONE_FADE_M = 500`
  - `LIMA_PROVINCE_DISTRICTS: readonly { slug: string; name: string }[]` (43 entries) and `isLimaDistrict(slug: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
test('haversine: Parque Castilla to Óvalo Gutiérrez is about 3.9 km', () => {
  const d = haversineM({ lat: -12.0849, lon: -77.0347 }, { lat: -12.1186, lon: -77.0446 });
  assert.ok(d > 3_700 && d < 4_000);
});
test('a circle zone has reach 1 inside and at the edge', () => {
  const z = circle({ rating: 9, radiusM: 400 });
  assert.equal(zoneReach(offset(z, 399), z).reach, 1);
  assert.equal(zoneReach(offset(z, 400), z).reach, 1);
});
test('reach falls to 0.5 at 250 m past the edge and 0 at 500 m', () => {
  const z = circle({ rating: 9, radiusM: 400 });
  assert.ok(Math.abs(zoneReach(offset(z, 650), z).reach - 0.5) < 0.02);
  assert.equal(zoneReach(offset(z, 900), z).reach, 0);
});
test('a district zone: reach 1 inside the polygon, fades outside', () => { /* square ring 1 km wide */ });
test('pickZone: highest reach wins; a tie goes to the smaller zone', () => {
  // point inside both a district square and a 300 m circle → the circle
});
test('pickZone returns null when no zone reaches the point', () => {});
test('a degenerate polygon with zero area does not throw', () => {});
test('GridIndex.near returns only items within the radius, nearest first', () => {});
test('Lima has 43 districts, includes every scraped slug, excludes callao', () => {
  assert.equal(LIMA_PROVINCE_DISTRICTS.length, 43);
  for (const slug of LIMA_DISTRICT_SLUGS) assert.ok(isLimaDistrict(slug));
  assert.equal(isLimaDistrict('callao'), false);
});
```

`circle` and `offset` are test helpers in the test file. `offset(z, m)` returns a point `m` meters north of the circle center.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --import tsx --test lib/location/*.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the three files**

Use the slugs from `scraper/src/config/districts.ts` for the 11 scraped districts (`magdalena` for Magdalena del Mar). Use `lima` for the Cercado de Lima.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --import tsx --test lib/location/*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/location
git commit -m "feat: geometry, zone reach, and the 43 Lima districts"
```

### Task 2: Local rent

**Files:**
- Create: `lib/location/local-rent.ts`
- Test: `lib/location/local-rent.test.ts`

**Interfaces:**
- Consumes: `GridIndex`, `LatLon` (Task 1), `bedroomBucket` (`lib/rent.ts`), `quantile` (`lib/linalg.ts`).
- Produces:
  - `type RentPoint = LatLon & { perM2: number; bedrooms: number | null }`
  - `type LocalRent = { middlePerM2: number; highPerM2: number; n: number; maxDistanceM: number }`
  - `localRent(subject: LatLon & { bedrooms: number | null }, rents: GridIndex<RentPoint>): LocalRent | null`
  - `LOCAL_RENT_RADIUS_M = 1000`, `LOCAL_RENT_K = 15`, `LOCAL_RENT_MIN = 8`

- [ ] **Step 1: Write the failing tests**

```ts
test('uses the 15 nearest rents of the same bedroom group within 1 km', () => {
  // 20 two-bedroom rents at 100..2000 m; perM2 = 30 near, 50 beyond 1 km
  const r = localRent({ ...center, bedrooms: 2 }, index);
  assert.equal(r?.n, 10); // only 10 within 1 km
  assert.equal(r?.middlePerM2, 30);
});
test('keeps only 15 when more are near', () => {});
test('ignores other bedroom groups', () => {});
test('returns null with fewer than 8 nearby rents', () => {});
test('high end is the 75th percentile', () => {
  // perM2 values 20..34 → p75 via quantile(values, 0.75)
});
test('a subject with null bedrooms uses rents of any group', () => {});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --import tsx --test lib/location/local-rent.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `localRent`**

- [ ] **Step 4: Run and watch it pass**

Run: `node --import tsx --test lib/location/local-rent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/location/local-rent.ts lib/location/local-rent.test.ts
git commit -m "feat: local rent from the nearest rent listings"
```

### Task 3: The score

**Files:**
- Create: `lib/location/score.ts`
- Test: `lib/location/score.test.ts`

**Interfaces:**
- Consumes: Task 1 and Task 2.
- Produces:
  - `type PlaceCategory = 'food' | 'park' | 'shop' | 'services' | 'transit'`
  - `type PlacePoint = LatLon & { category: PlaceCategory }`
  - `type DistrictStatInput = { slug: string; incomePerCapitaPen: number | null; complaintsPer10k: number | null }`
  - `type RentActivityPoint = LatLon & { live: boolean; daysOnline: number | null }` (`daysOnline` set only for gone listings seen in the last 180 days)
  - `type ScoreSubject = { propertyId: string; districtSlug: string; lat: number | null; lon: number | null; bedrooms: number | null }`
  - `type LocationReason = { tone: 'up' | 'down' | 'info'; text: string }`
  - `type LocationResult = { propertyId: string; status: 'OK' | 'OUTSIDE_LIMA' | 'NO_COORDINATES'; score: number | null; livability: number | null; demand: number | null; reasons: LocationReason[]; localRent: LocalRent | null }`
  - `scoreAll(input: { subjects: ScoreSubject[]; places: PlacePoint[]; zones: ZoneShape[]; districtStats: DistrictStatInput[]; rentActivity: RentActivityPoint[]; rents: RentPoint[] }): LocationResult[]`
  - `percentileScore(values: number[], v: number): number` = `(below + 0.5 × equal) / n × 10`
- Rules:
  - Place counts within 500 m per category, each a percentile among subjects with status OK. The place part is their mean.
  - Livability: with a zone, `w = 0.6 × reach`, `livability = w × rating + (1 − w) × placePart`. Without a zone, `livability = placePart`.
  - Demand has four signals. Each is a percentile among OK subjects:
    - the live rent listings within 1 km
    - the median `daysOnline` of gone rent listings within 1 km, from at least 5 listings, inverted (`10 − p`)
    - the district income
    - the district complaints, inverted
  - Demand is the mean of the signals that exist. With no signal, demand is null and the score is the livability.
  - Outside Lima or with no coordinates: score, livability, demand, and local rent are null, and the reasons are empty.
- Reason texts (exact):
  - inside a zone: `Dentro de ${name} (tu zona, ${rating}/10)`. Near a zone: `Cerca de ${name} (tu zona, ${rating}/10), a ${round to 10 m} m`. The tone is `up` for a rating of 6 or more, `down` for 4 or less, and `info` between.
  - `${food} restaurantes y ${park} parques a menos de 500 m` (tone `info`)
  - speed signal ≥ 6.5: `Los alquileres cercanos se van rápido (mediana ${d} días)` (up). At 3.5 or less: `Los alquileres cercanos tardan en irse (mediana ${d} días)` (down).
  - income ≥ 6.5: `Ingreso por persona alto en el distrito (INEI)` (up). At 3.5 or less: `Ingreso por persona bajo en el distrito (INEI)` (down).
  - complaints signal ≥ 6.5: `Pocas denuncias en el distrito` (up). At 3.5 or less: `Muchas denuncias en el distrito` (down).
  - missing: `Sin datos de delitos para este distrito`, `Sin datos de ingresos para este distrito`, `Pocos alquileres cercanos para medir la demanda` (info)

- [ ] **Step 1: Write the failing tests**

```ts
test('percentileScore gives 5 to a lone value and splits ties', () => {
  assert.equal(percentileScore([3], 3), 5);
  assert.equal(percentileScore([1, 2, 2, 3], 2), 5);
});
test('an apartment inside a zone rated 9 gets livability 0.6×9 + 0.4×placePart', () => {});
test('a low-rated zone lowers livability below the place part', () => {
  // zone rated 2 around the subject; placePart ≈ 7.5 → livability < placePart
});
test('score is the plain average of livability and demand, one decimal', () => {});
test('a missing district stat drops that signal and adds the reason', () => {
  // complaintsPer10k null → reasons include 'Sin datos de delitos para este distrito'
});
test('no demand signal at all: score equals livability', () => {});
test('outside Lima and no coordinates get null scores and the right status', () => {
  // districtSlug 'callao' → OUTSIDE_LIMA; lat null → NO_COORDINATES
});
test('the zone reason names the distance rounded to 10 m', () => {
  // 'Cerca de Parque Castilla (tu zona, 9/10), a 200 m'
});
test('localRent is attached to OK results', () => {});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --import tsx --test lib/location/score.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `scoreAll` and `percentileScore`**

Build one `GridIndex` each for places, rent activity, and rents. Round livability and demand to one decimal for storage.

- [ ] **Step 4: Run and watch it pass**

Run: `node --import tsx --test lib/location/score.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/location/score.ts lib/location/score.test.ts
git commit -m "feat: location score from zones, places, and demand signals"
```

### Task 4: Schema, sources, and `location:places`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration `prisma/migrations/<timestamp>_location_score/`
- Create: `lib/location/overpass.ts`, `lib/location/district-stats.ts`, `scraper/src/location-places.ts`, `data/location/district-stats.csv`
- Modify: `package.json` (script `"location:places": "tsx --env-file-if-exists=.env scraper/src/location-places.ts"`)
- Test: `lib/location/overpass.test.ts`, `lib/location/district-stats.test.ts`

**Interfaces:**
- Produces:
  - Prisma models: `Place { id String @id (OpenStreetMap type/id, for example "node/123"), category String, name String?, latitude Decimal(10,7), longitude Decimal(10,7) }` with an index on `category`. `Zone { id cuid, name, kind ZoneKind, districtSlug String?, latitude Decimal?, longitude Decimal?, radiusM Int?, rating Int, notes String?, createdAt, updatedAt }`. `DistrictStat { slug String @id, name String, incomePerCapitaPen Decimal?, incomeSource String?, incomeDate String?, complaintsPer10k Decimal?, complaintsSource String?, complaintsDate String?, boundary Json? }`. `PropertyLocation { propertyId String @id (relation to Property, onDelete Cascade), status LocationStatus, score Decimal(3,1)?, livability Decimal(3,1)?, demand Decimal(3,1)?, reasons Json, localRentPerM2 Decimal?, localRentHighPerM2 Decimal?, localRentN Int?, localRentMaxDistanceM Int?, computedAt DateTime }`. Enums `ZoneKind { DISTRICT CIRCLE }`, `LocationStatus { OK OUTSIDE_LIMA NO_COORDINATES }`.
  - `buildOverpassQuery(): string`: one query for the province of Lima (`area["name"="Lima"]["admin_level"="6"]`). It returns the place categories with `out center tags;` and the district relations (`admin_level=8`) with `out geom;`.
  - Category tags:
    - food: `amenity=restaurant|cafe|fast_food`
    - park: `leisure=park|garden` and `place=square`
    - shop: `shop=supermarket|convenience` and `amenity=marketplace`
    - services: `amenity=pharmacy|clinic|hospital|doctors|school`
    - transit: `highway=bus_stop` and `public_transport=station`
  - `parseOverpassPlaces(json: unknown): { id: string; category: PlaceCategory; name: string | null; lat: number; lon: number }[]`. Ways use `center`. Elements with unknown tags are skipped.
  - `parseOverpassBoundaries(json: unknown): { slug: string; name: string; rings: Ring[] }[]`. It joins outer members into rings. It matches names to `LIMA_PROVINCE_DISTRICTS`, ignoring accents and case, and skips names with no match.
  - `parseDistrictStatsCsv(text: string): (DistrictStatInput & { incomeSource; incomeDate; complaintsSource; complaintsDate })[]`. Header: `slug,income_per_capita_pen,income_source,income_date,complaints_per_10k,complaints_source,complaints_date`. Empty cells are null. An unknown slug throws `Distrito desconocido en district-stats.csv: <slug>`. A non-numeric number throws `Número inválido en district-stats.csv, fila <n>: <value>`.

- [ ] **Step 1: Write the failing tests**

Tests use small JSON samples written in the test file, not a network call.

```ts
test('parseOverpassPlaces maps tags to categories and uses the way center', () => {});
test('parseOverpassPlaces skips elements with no known tag', () => {});
test('parseOverpassBoundaries joins outer ways into a closed ring and matches "Jesús María" to jesus-maria', () => {});
test('buildOverpassQuery is one query with out center and out geom', () => {
  const q = buildOverpassQuery();
  assert.match(q, /out center tags;/);
  assert.match(q, /out geom;/);
});
test('parseDistrictStatsCsv reads empty cells as null', () => {});
test('parseDistrictStatsCsv throws on an unknown slug', () => {});
test('parseDistrictStatsCsv throws on a non-numeric number', () => {});
test('the committed district-stats.csv parses and covers the 11 scraped districts', () => {});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --import tsx --test lib/location/overpass.test.ts lib/location/district-stats.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Add the models and create the migration on `dptos_seed` only**

Run: `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed pnpm prisma migrate dev --name location_score`
Expected: migration created and applied, client generated.

- [ ] **Step 4: Implement the parsers and the command**

`scraper/src/location-places.ts` sends one POST to `https://overpass-api.de/api/interpreter` with a generic User-Agent `dptos-location/1.0` and a 180 s timeout. It writes `data/location/places-lima.json` and `data/location/boundaries-lima.json`. In one transaction, it replaces all `Place` rows and upserts `DistrictStat.name` and `boundary`.

- [ ] **Step 5: Type `data/location/district-stats.csv`**

Fill income from INEI. Fill complaints per 10,000 people from the SIDPOL report of January 2026 or the INEI security bulletin. Put the source URL and date on each row. Cover at least the 11 scraped districts. If no free source gives a number, leave the cell empty. Never invent a number. Record each district you leave empty as a ruling.

- [ ] **Step 6: Run and watch it pass**

Run: `node --import tsx --test lib/location/overpass.test.ts lib/location/district-stats.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add prisma lib/location data/location/district-stats.csv scraper/src/location-places.ts package.json
git commit -m "feat: location tables, Overpass and district stats parsers, location:places"
```

### Task 5: Refresh

**Files:**
- Create: `lib/location/refresh.ts`, `scraper/src/location-refresh.ts`
- Modify: `scraper/src/index.ts` (after `invalidateMarketCache()` in a non-dry run), `package.json` (script `"location:refresh": "tsx --env-file-if-exists=.env scraper/src/location-refresh.ts"`)
- Test: `lib/location/refresh.test.ts`

**Interfaces:**
- Consumes: `scoreAll` (Task 3), the models and `parseDistrictStatsCsv` (Task 4), `possiblySoldCutoffs` and `livePostingWhere` as `lib/market.ts` uses them.
- Produces:
  - `loadScoreInput(db: PrismaClient): Promise<Parameters<typeof scoreAll>[0]>`. Subjects are active sale UNIT properties. Coordinates come from the current snapshot, then from the property. Rents are live rent UNIT postings with a usable snapshot (as in `loadRentObservations`), with coordinates and area. Rent activity covers rent postings with coordinates: live ones, and gone ones with `daysOnline = (removedAt ?? lastSeenAt) − firstSeenAt` in days, gone within the last 180 days.
  - `syncDistrictStats(db, csvText: string): Promise<void>`. It upserts the numbers and keeps `boundary`.
  - `buildRows(results: LocationResult[], computedAt: Date): Prisma.PropertyLocationCreateManyInput[]` (pure)
  - `refreshLocations(db: PrismaClient): Promise<{ scored: number; outsideLima: number; noCoordinates: number }>`. It syncs `data/location/district-stats.csv`, computes, and in one transaction deletes all `PropertyLocation` rows and inserts the new ones.

- [ ] **Step 1: Write the failing tests**

```ts
test('buildRows maps an OK result with local rent and an OUTSIDE_LIMA result', () => {});
test('buildRows stores reasons as JSON and scores as one-decimal values', () => {});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --import tsx --test lib/location/refresh.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `refresh.ts`, the command, and the scrape hook**

In `scraper/src/index.ts`, wrap the refresh call in try/catch. A failed refresh pushes `location refresh failed: <message>` to `run.errors` and does not fail the run.

- [ ] **Step 4: Run and watch it pass, then run the command on the seed database**

Run: `node --import tsx --test lib/location/refresh.test.ts && DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed pnpm location:refresh`
Expected: PASS, then a line with the scored, outside-Lima, and no-coordinate counts.

- [ ] **Step 5: Commit**

```bash
git add lib/location scraper/src package.json
git commit -m "feat: location refresh after each scrape and as a command"
```

### Task 6: Rows and query

**Files:**
- Create: `lib/location/row-rent.ts`
- Modify: `lib/listing-row.ts`, `lib/listings.ts`, `lib/departamentos-query.ts`, `lib/departamentos-search-params.ts`
- Test: `lib/departamentos-query.test.ts`, `lib/location/row-rent.test.ts`

**Interfaces:**
- Consumes: `PropertyLocation` (Task 4), `RentEstimate` (`lib/rent.ts`).
- Produces:
  - `ListingRow` gains `locationStatus: 'OK' | 'OUTSIDE_LIMA' | 'NO_COORDINATES' | null`, `locationScore`, `locationLivability`, `locationDemand: number | null`, `locationReasons: LocationReason[]`, `rentHighPen: number | null`, `rentIsLocal: boolean`, `rentMaxDistanceM: number | null`.
  - `rentForRow(input: { areaM2: number | null; local: { perM2: number; highPerM2: number; n: number; maxDistanceM: number } | null; district: RentEstimate | null }): { grossRentPen; rentSampleN; rentConfidence; rentHighPen; rentIsLocal; rentMaxDistanceM }`. With local rent, the rent is middle × area and the high end is high × area. The confidence is `high` for n of 12 or more, else `low`. Without local rent, the row uses the district estimate, `rentIsLocal` is false, and `rentHighPen` is null.
  - Search param `ubicacion: parseAsFloat`. Sort id `location`. The default sort stays `monthlyGain`.
  - With `ubicacion` set, rows with a null score are left out.

- [ ] **Step 1: Write the failing tests**

```ts
test('rentForRow uses the local middle for the money and keeps the high end apart', () => {
  const r = rentForRow({ areaM2: 70, local: { perM2: 30, highPerM2: 36, n: 14, maxDistanceM: 780 }, district: districtAt(25) });
  assert.equal(r.grossRentPen, 2_100);
  assert.equal(r.rentHighPen, 2_520);
  assert.equal(r.rentIsLocal, true);
});
test('rentForRow falls back to the district estimate', () => {});
test('ubicacion=7 keeps rows with score ≥ 7 and drops null scores', () => {});
test('sort=location orders by score, nulls last in both orders', () => {});
test('the default sort is still monthlyGain', () => {});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --import tsx --test lib/location/row-rent.test.ts lib/departamentos-query.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

`lib/listings.ts` loads `PropertyLocation` rows for the candidate property ids in one query and calls `rentForRow`. Every money number keeps reading `grossRentPen`, so the local rent reaches them with no other change.

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib
git commit -m "feat: local rent in every row, location filter and sort"
```

### Task 7: Table

**Files:**
- Modify: `app/departamentos/departamentos-table.tsx`, `app/departamentos/departamentos-unified-client.tsx`

**Interfaces:**
- Consumes: the row fields and the `ubicacion` param (Task 6).

- [ ] **Step 1: Add the column, the filter, and the rent line**

- Column "Ubicación": the score with one decimal, or `Fuera de Lima` or `Sin ubicación exacta`. The `title` lists the reasons, one per line.
- Filter "Ubicación mínima" (number from 0 to 10) bound to `ubicacion`.
- Sort label `ubicación` in `SORT_LABELS`.
- Rent line in the existing rent cell: with local rent, `Alquiler estimado ${formatPen(grossRentPen)} (${rentSampleN} alquileres a menos de ${rentMaxDistanceM rounded up to 100} m). Los mejores cercanos: ${formatPen(rentHighPen)}`. With the district fallback, `Alquiler estimado ${formatPen(grossRentPen)} (mediana del distrito)`.

- [ ] **Step 2: Run the static checks**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. The live check moves to Task 9, where the seed has locations.

- [ ] **Step 3: Commit**

```bash
git add app/departamentos
git commit -m "feat: location column, minimum location filter, local rent line"
```

### Task 8: Zones page

**Files:**
- Create: `lib/location/zone-input.ts`, `app/zonas/page.tsx`, `app/zonas/zonas-client.tsx`, `app/zonas/actions.ts`
- Modify: the navigation in `app/layout.tsx` (link "Zonas")
- Test: `lib/location/zone-input.test.ts`

**Interfaces:**
- Consumes: `isLimaDistrict` (Task 1), `refreshLocations` (Task 5).
- Produces:
  - `parseCoordinates(text: string): LatLon | null`. It reads `@lat,lon`, `?q=lat,lon`, `!3dlat!4dlon`, and plain `lat, lon`.
  - `validateZoneInput(raw: Record<string, string>): { ok: true; zone: ZoneData } | { ok: false; errors: Record<string, string> }`. Rules: name is required (`Escribe un nombre`). The rating is an integer from 0 to 10 (`La nota va de 0 a 10`). For a point: coordinates must parse (`No pude leer las coordenadas. Pega un enlace de Google Maps o escribe "lat, lon"`) and fall inside the box lat −12.55 to −11.55, lon −77.25 to −76.60 (`Las coordenadas no están en Lima`). The radius is from 50 to 3000 m, with a default of 400 (`El radio va de 50 a 3000 m`). For a district: the slug must be a Lima district (`Elige un distrito de Lima`).
  - Server actions `saveZone(formData)` and `deleteZone(id)`. If a district zone has no `DistrictStat.boundary`, `saveZone` returns `Falta el límite del distrito. Corre pnpm location:places.` After a save or a delete, the action runs `refreshLocations`. Then it revalidates the same tag and paths as `refreshListings` in `app/actions.ts`, plus `/zonas`.

- [ ] **Step 1: Write the failing tests**

```ts
test('parseCoordinates reads a Google Maps @ link', () => {
  assert.deepEqual(parseCoordinates('https://www.google.com/maps/place/Parque+Castilla/@-12.0849,-77.0347,17z'), { lat: -12.0849, lon: -77.0347 });
});
test('parseCoordinates reads !3d!4d, ?q=, and plain pairs', () => {});
test('parseCoordinates returns null for a short link it cannot read', () => {
  assert.equal(parseCoordinates('https://maps.app.goo.gl/abc123'), null);
});
test('validateZoneInput rejects coordinates outside Lima', () => {});
test('validateZoneInput defaults the radius to 400', () => {});
test('validateZoneInput rejects a rating of 11 and a missing name', () => {});
test('validateZoneInput rejects a district outside Lima', () => {});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --import tsx --test lib/location/zone-input.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the validator, the page, the form, and the actions**

The page lists zones (name, kind, rating, radius or district, notes) with edit and delete buttons. The form shows the Spanish errors next to each field.

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass, clean.

- [ ] **Step 5: Commit**

```bash
git add lib/location app/zonas app/layout.tsx
git commit -m "feat: zones page to rate districts and points"
```

### Task 9: Seed, README, and live check

**Files:**
- Create: `prisma/seed-location.ts`, `data/location/seed-places.json`, `data/location/seed-boundaries.json`
- Modify: `prisma/seed-market.ts`, `prisma/seed-cases.ts`, `prisma/seed-cases.test.ts`, `README.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing tests in `prisma/seed-cases.test.ts`**

```ts
test('the location cases score as their titles say', () => {
  // build the seed places, zones, district stats, and the three location cases;
  // run scoreAll; "Lince junto a San Isidro" scores above "Lince lejos de toda zona"
});
test('the local-rent case gets a local rent above its district median', () => {});
test('market seed units get distinct coordinates within 1.2 km of the district center', () => {});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --import tsx --test prisma/seed-cases.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

- The market seed gives each unit, sale and rent, deterministic coordinates within 1.2 km of its district center, from the seed's existing random generator.
- `UnitSpec` gains optional `lat` and `lon`.
- Three cases:
  - "Lince junto a San Isidro", about 150 m from the San Isidro edge
  - "Lince lejos de toda zona"
  - "Alquiler local sobre la mediana del distrito", among seeded rents priced 25% above the district
- `seed-places.json` holds synthetic places around the seeded districts. `seed-boundaries.json` holds simple polygons for the seeded districts.
- `seed-location.ts` loads both files. It creates the zone "San Isidro" (district, 9) and the zone "Parque Castilla" (point -12.0849, -77.0347, 400 m, 9). It runs `refreshLocations` at the end of the seed.
- The checklist adds the three cases and `/zonas`.
- README: a section "Ubicación" with `pnpm location:places`, `pnpm location:refresh`, `/zonas`, the sources, and the note that a rent scrape must run first.

- [ ] **Step 4: Run, seed, and check live**

Run: `pnpm test && DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed pnpm db:seed:market -- --weeks=8 --reset`
Expected: all tests pass, and the checklist prints the location cases. Then start the dev server with the same `DATABASE_URL`. Open `/departamentos?efectivo=200000&ubicacion=6` and `/zonas`. Look for the column, the reasons, the rent line, and the filter. Save one test zone and see the score change.

- [ ] **Step 5: Commit**

```bash
git add prisma data/location README.md
git commit -m "feat: location in the seed, location cases, README section"
```
