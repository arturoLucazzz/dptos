# District Statistics Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store official district statistics from CSV files, one row per place, indicator, and period. The location score reads income strata, poverty, and crime from them.

**Architecture:** Pure parsing and checks live in `lib/stats/`. A `Statistic` table mirrors the files in `data/stats/`, and `pnpm stats:load` replaces its rows in one transaction and then runs the location refresh. The score gets the latest value of each indicator per district through one helper. The old `district-stats.csv` path and its `DistrictStat` columns go away.

**Tech Stack:** TypeScript, Prisma 7 with `@prisma/adapter-pg`, Postgres, node:test with tsx.

**Spec:** `docs/superpowers/specs/2026-11-19-district-statistics-design.md`

## Global Constraints

- Data files live in `data/stats/`, committed. Data file header, exact: `place,indicator,value,period,source,source_ref`.
- `indicators.csv` header, exact: `indicator,label,unit,description`. `places.csv` header, exact: `place,kind,label,districts` (districts separated by `;`).
- A place is a slug from `lib/location/lima-districts.ts` or a `place` in `places.csv`.
- `period` is sortable text: `2020`, `2025-10`, or `2024-11..2025-10`. A window sorts by its end (the part after `..`).
- Unique on `(place, indicator, period)` across all files.
- Error messages are Spanish and name the file and the row number.
- Score indicators: `high_income_pct` (higher is better), `poverty_pct` (lower is better), `complaints_per_10k` (lower is better). NSE and `population` are context only.
- Sense check for a score indicator: San Isidro, Miraflores, and San Borja each have fewer than 6 of the 11 app districts (`LIMA_DISTRICT_SLUGS`) strictly better than them (better half).
- Never touch the database `dptos` during the build. Use `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed`. Never run `pnpm replay --reset` on a real database.
- The local `sed` is GNU sed. Use python for in-place edits.
- Test command for the whole suite: `pnpm test`. Typecheck: `pnpm typecheck` (or `npx tsc --noEmit`). Lint: `pnpm lint`.

## Review Focus

1. A file saved from Excel, with a UTF-8 BOM, CRLF line ends, or blank lines at the end: it loads the same as a clean file. Test in Task 1.
2. A value written with a thousands separator or a decimal comma, like `"2,412"` or `"12,5"`: the loader rejects the row with the file and row number, and never stores a wrong number. Test in Task 1.
3. The same place, indicator, and period in two files: the error names both files. Test in Task 1.
4. A district with no value for a score indicator: the score drops that signal for that district and does not crash. Test in Task 3.
5. If the location refresh fails after `stats:load`, the statistics stay loaded, and the command prints the refresh error and exits with code 1. Test in Task 2.

---

### Task 1: Parse and check statistics files

**Files:**
- Create: `lib/stats/csv.ts`, `lib/stats/files.ts`, `lib/stats/latest.ts`
- Test: `lib/stats/files.test.ts`, `lib/stats/latest.test.ts`

**Interfaces:**
- Produces:
  - `splitCsvLine(line: string): string[]` and `csvLines(text: string): string[]` in `csv.ts`. `csvLines` strips a BOM, splits on `\r?\n`, and drops blank lines. Move `splitCsvLine` from `lib/location/district-stats.ts` unchanged.
  - In `files.ts`:
    - `type IndicatorDef = { indicator: string; label: string; unit: string; description: string }`
    - `type PlaceDef = { place: string; kind: string; label: string; districts: string[] }`
    - `type StatRow = { place: string; indicator: string; value: number; period: string; source: string; sourceRef: string; file: string }`
    - `parseIndicators(text: string): IndicatorDef[]`
    - `parsePlaces(text: string): PlaceDef[]`
    - `parseStatFile(file: string, text: string, ctx: { indicators: Set<string>; places: Set<string> }): StatRow[]`
    - `checkUnique(rows: StatRow[]): void`
  - In `latest.ts`:
    - `periodEnd(period: string): string`
    - `type LatestStat = { value: number; period: string; source: string }`
    - `latestStats(rows: Pick<StatRow, 'place' | 'indicator' | 'value' | 'period' | 'source'>[]): Map<string, Map<string, LatestStat>>`, keyed by place, then indicator.
    - `periodYear(period: string): string`, the last four-digit year in the period (`'2024-11..2025-10'` gives `'2025'`).

- [ ] **Step 1: Write the failing tests in `lib/stats/files.test.ts`**

```ts
const ctx = { indicators: new Set(['high_income_pct', 'poverty_pct']), places: new Set(['lince', 'san-isidro', 'apeim-zona-7']) };
const H = 'place,indicator,value,period,source,source_ref';

test('parseStatFile reads rows and keeps the file name', () => {
  const rows = parseStatFile('a.csv', `${H}\nlince,high_income_pct,19.9,2020,"INEI, Planos 2020",p. 32\n`, ctx);
  assert.deepEqual(rows, [{ place: 'lince', indicator: 'high_income_pct', value: 19.9, period: '2020', source: 'INEI, Planos 2020', sourceRef: 'p. 32', file: 'a.csv' }]);
});

test('a BOM, CRLF line ends, and trailing blank lines load the same', () => {
  const rows = parseStatFile('a.csv', `﻿${H}\r\nlince,high_income_pct,19.9,2020,INEI,p. 32\r\n\r\n\r\n`, ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, 19.9);
});

test('a wrong header names the file and the expected header', () => {
  assert.throws(() => parseStatFile('a.csv', 'place,value\n', ctx), { message: `Encabezado inválido en a.csv. Debe ser: ${H}` });
});

test('unknown place, unknown indicator, empty source, and bad numbers name file and row', () => {
  assert.throws(() => parseStatFile('a.csv', `${H}\ncallao,high_income_pct,1,2020,INEI,p\n`, ctx), { message: 'Lugar desconocido en a.csv, fila 2: callao' });
  assert.throws(() => parseStatFile('a.csv', `${H}\nlince,age_median,1,2020,INEI,p\n`, ctx), { message: 'Indicador desconocido en a.csv, fila 2: age_median (agrégalo a indicators.csv)' });
  assert.throws(() => parseStatFile('a.csv', `${H}\nlince,high_income_pct,1,2020,,p\n`, ctx), { message: 'Falta la fuente en a.csv, fila 2' });
  assert.throws(() => parseStatFile('a.csv', `${H}\nlince,high_income_pct,"2,412",2020,INEI,p\n`, ctx), { message: 'Número inválido en a.csv, fila 2: 2,412 (usa punto decimal y sin separador de miles)' });
  assert.throws(() => parseStatFile('a.csv', `${H}\nlince,high_income_pct,,2020,INEI,p\n`, ctx), { message: 'Número inválido en a.csv, fila 2:  (usa punto decimal y sin separador de miles)' });
});

test('checkUnique names both files for a repeated place, indicator, and period', () => {
  const a = parseStatFile('a.csv', `${H}\nlince,high_income_pct,19.9,2020,INEI,p\n`, ctx);
  const b = parseStatFile('b.csv', `${H}\nlince,high_income_pct,20,2020,INEI,p\n`, ctx);
  assert.throws(() => checkUnique([...a, ...b]), { message: 'Dato repetido: lince, high_income_pct, 2020 en a.csv y b.csv' });
});

test('parsePlaces splits districts and rejects a non-Lima district', () => {
  const text = 'place,kind,label,districts\napeim-zona-7,zone,Zona 7 (APEIM),miraflores;san-isidro\n';
  assert.deepEqual(parsePlaces(text)[0].districts, ['miraflores', 'san-isidro']);
  assert.throws(() => parsePlaces('place,kind,label,districts\nz,zone,Z,callao\n'), { message: 'Distrito desconocido en places.csv, fila 2: callao' });
});

test('parseIndicators reads the catalog', () => {
  const [d] = parseIndicators('indicator,label,unit,description\npoverty_pct,Pobreza,%,"Pobreza monetaria total, INEI"\n');
  assert.deepEqual(d, { indicator: 'poverty_pct', label: 'Pobreza', unit: '%', description: 'Pobreza monetaria total, INEI' });
});
```

- [ ] **Step 2: Write the failing tests in `lib/stats/latest.test.ts`**

```ts
test('latestStats keeps the greatest period per place and indicator', () => {
  const m = latestStats([
    { place: 'lince', indicator: 'poverty_pct', value: 3, period: '2013', source: 'INEI 2013' },
    { place: 'lince', indicator: 'poverty_pct', value: 2, period: '2018', source: 'INEI 2018' },
    { place: 'lince', indicator: 'complaints_per_10k', value: 90, period: '2024-11..2025-10', source: 'SIDPOL' },
    { place: 'lince', indicator: 'complaints_per_10k', value: 80, period: '2025-06', source: 'SIDPOL' },
  ]);
  assert.equal(m.get('lince')!.get('poverty_pct')!.value, 2);
  assert.equal(m.get('lince')!.get('complaints_per_10k')!.value, 90); // window end 2025-10 beats 2025-06
});

test('periodEnd and periodYear', () => {
  assert.equal(periodEnd('2024-11..2025-10'), '2025-10');
  assert.equal(periodEnd('2020'), '2020');
  assert.equal(periodYear('2024-11..2025-10'), '2025');
  assert.equal(periodYear('2020'), '2020');
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `node --import tsx --test lib/stats/*.test.ts`
Expected: FAIL, the modules do not exist.

- [ ] **Step 4: Implement `csv.ts`, `files.ts`, and `latest.ts` with the signatures above**

A valid number matches `^-?\d+(\.\d+)?$` after trimming. Row numbers count the header as row 1. Use `isLimaDistrict` from `lib/location/lima-districts.ts` for district places.

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --import tsx --test lib/stats/*.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/stats
git commit -m "feat: parse and check district statistics files"
```

### Task 2: Statistic table, first data, and `pnpm stats:load`

**Files:**
- Modify: `prisma/schema.prisma` (add `Statistic`), new migration
- Create: `lib/stats/store.ts`, `lib/stats/store.test.ts`, `scraper/src/stats-load.ts`
- Create: `data/stats/indicators.csv`, `data/stats/places.csv`, `data/stats/inei-estratos-2020.csv`, `data/stats/inei-estratos-2020.md`
- Create: `lib/stats/committed-files.test.ts`
- Modify: `package.json` (script `stats:load`)

**Interfaces:**
- Consumes: Task 1 (`parseIndicators`, `parsePlaces`, `parseStatFile`, `checkUnique`, `StatRow`).
- Produces:
  - `STATS_DIR = 'data/stats'`
  - `readStatFiles(dir: string): StatRow[]` reads `indicators.csv`, `places.csv`, and every other `*.csv`, then runs `checkUnique`. A missing `places.csv` counts as empty.
  - `loadStatistics(db: PrismaClient, rows: StatRow[], loadedAt: Date): Promise<number>` deletes all `Statistic` rows and inserts `rows` in one transaction, and returns the count.
  - `readLatestStats(db: PrismaClient): Promise<Map<string, Map<string, LatestStat>>>`
  - `runStatsLoad(deps: { read: () => StatRow[]; load: (rows: StatRow[]) => Promise<number>; refresh: () => Promise<unknown> }): Promise<{ loaded: number; refreshError: string | null }>`

- [ ] **Step 1: Add the model and migration**

```prisma
model Statistic {
  id        String   @id @default(cuid())
  place     String
  indicator String
  value     Decimal  @db.Decimal(14, 4)
  period    String
  source    String
  sourceRef String
  file      String
  loadedAt  DateTime
  @@unique([place, indicator, period])
  @@index([indicator])
}
```

Run: `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed pnpm prisma migrate dev --name district_statistics`
Expected: the migration applies to `dptos_seed` and the client generates.

- [ ] **Step 2: Write the data files**

- `indicators.csv` rows: `high_income_pct` (label `Vecinos en estrato de ingreso alto`, unit `%`, description: share of people in blocks at or above S/ 2,412.45 of household income per person a month, INEI), `poverty_pct`, `complaints_per_10k`, `population`, `nse_a_pct`, `nse_b_pct`, `nse_c_pct`, `nse_d_pct`, `nse_e_pct`. Spanish labels.
- `places.csv`: the header only. Task 6 adds zones.
- `inei-estratos-2020.csv`: one `high_income_pct` row per district, built from `docs/superpowers/plans/2026-11-19-inei-strata-readings.csv` as `round(100 × alto / total, 1)`. Period `2020`. Source `INEI, Planos estratificados de Lima Metropolitana a nivel de manzana 2020`. `source_ref` `p. <page>`. Check: san-isidro is `100.0`, lince is `19.9`, barranco is `13.2`.
- `inei-estratos-2020.md`: the document link `https://www.inei.gob.pe/media/MenuRecursivo/publicaciones_digitales/Est/Lib1744/libro.pdf`, pages 17 to 59, read from the page images, each row checked against its printed total. The readings file path. What "Alto" means: blocks, not people, and the S/ 2,412.45 line.

- [ ] **Step 3: Write the failing tests**

`lib/stats/committed-files.test.ts`:

```ts
test('the committed statistics files load', () => {
  const rows = readStatFiles(STATS_DIR);
  const income = rows.filter((r) => r.indicator === 'high_income_pct');
  assert.equal(income.length, 43);
  assert.equal(income.find((r) => r.place === 'san-isidro')!.value, 100);
  assert.equal(income.find((r) => r.place === 'lince')!.value, 19.9);
});
```

`lib/stats/store.test.ts`:

```ts
test('runStatsLoad keeps the load when the refresh fails', async () => {
  const loaded: StatRow[][] = [];
  const result = await runStatsLoad({ read: () => [row], load: async (r) => { loaded.push(r); return r.length; }, refresh: async () => { throw new Error('boom'); } });
  assert.equal(loaded.length, 1);
  assert.deepEqual(result, { loaded: 1, refreshError: 'boom' });
});

test('runStatsLoad does not load or refresh when the files fail the checks', async () => {
  let calls = 0;
  await assert.rejects(runStatsLoad({ read: () => { throw new Error('Lugar desconocido en a.csv, fila 2: callao'); }, load: async () => ++calls, refresh: async () => ++calls }), /Lugar desconocido/);
  assert.equal(calls, 0);
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `node --import tsx --test lib/stats/*.test.ts`
Expected: FAIL, `store.ts` does not exist.

- [ ] **Step 5: Implement `store.ts` and `scraper/src/stats-load.ts`**

The command prints `Estadísticas: <n> filas cargadas.`, then the refresh counts in the same words as `location:refresh`. If the refresh fails, it prints `Las estadísticas quedaron guardadas, pero el recálculo falló: <message>. Corre pnpm location:refresh.` and sets `process.exitCode = 1`. Script: `"stats:load": "tsx --env-file-if-exists=.env scraper/src/stats-load.ts"`.

- [ ] **Step 6: Run the tests, then the command on the seed database**

Run: `node --import tsx --test lib/stats/*.test.ts`
Expected: PASS.
Run: `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed pnpm stats:load`
Expected: `Estadísticas: 43 filas cargadas.` and the location counts. (The score does not read the table yet.)

- [ ] **Step 7: Commit**

```bash
git add prisma lib/stats scraper/src/stats-load.ts data/stats package.json
git commit -m "feat: statistics table, INEI income strata, and stats:load"
```

### Task 3: The score reads statistics; the old district stats go away

**Files:**
- Modify: `lib/location/score.ts`, `lib/location/score.test.ts`, `lib/location/refresh.ts`, `scraper/src/location-refresh.ts` (doc comment), `prisma/seed-location.ts`, `README.md` (section "Ubicación", last paragraph)
- Modify: `prisma/schema.prisma` (drop six `DistrictStat` columns), new migration
- Delete: `lib/location/district-stats.ts`, `lib/location/district-stats.test.ts`, `data/location/district-stats.csv`

**Interfaces:**
- Consumes: `readLatestStats` (Task 2), `periodYear` (Task 1), `readStatFiles` and `loadStatistics` (Task 2) for the seed.
- Produces: `DistrictStatInput` becomes
  `{ slug: string; highIncomePct: StatValue | null; povertyPct: StatValue | null; complaintsPer10k: StatValue | null }` with `type StatValue = { value: number; period: string }`.
  `SCORE_INDICATORS = { highIncome: 'high_income_pct', poverty: 'poverty_pct', complaints: 'complaints_per_10k' } as const` exported from `score.ts`.

- [ ] **Step 1: Change the tests in `score.test.ts` first**

Replace the income fixtures with `highIncomePct: { value, period: '2020' }`, and the reason strings with the new ones. Add:

```ts
test('income, poverty, and complaints each add a signal and a reason with the source year', () => {
  const stats = [
    { slug: 'lince', highIncomePct: { value: 19.9, period: '2020' }, povertyPct: { value: 6, period: '2018' }, complaintsPer10k: { value: 300, period: '2024-11..2025-10' } },
    { slug: 'san-isidro', highIncomePct: { value: 100, period: '2020' }, povertyPct: { value: 1, period: '2018' }, complaintsPer10k: { value: 100, period: '2024-11..2025-10' } },
  ];
  const results = scoreAll({ ...empty, subjects: [subject('poor'), subject('rich', { districtSlug: 'san-isidro' })], districtStats: stats });
  const rich = results.find((r) => r.propertyId === 'rich')!;
  assert.equal(rich.demand, 7.5);
  assert.ok(rich.reasons.some((x) => x.text === '100% vive en manzanas de ingreso alto (INEI 2020)' && x.tone === 'up'));
  assert.ok(rich.reasons.some((x) => x.text === 'Pobreza baja en el distrito (INEI 2018)' && x.tone === 'up'));
  assert.ok(rich.reasons.some((x) => x.text === 'Pocas denuncias en el distrito (SIDPOL 2025)' && x.tone === 'up'));
  const poor = results.find((r) => r.propertyId === 'poor')!;
  assert.ok(poor.reasons.some((x) => x.text === '20% vive en manzanas de ingreso alto (INEI 2020)' && x.tone === 'down'));
});

test('a district with no statistics drops those signals and does not crash', () => {
  const [r] = scoreAll({ ...empty, subjects: [subject('a')], districtStats: [{ slug: 'lince', highIncomePct: null, povertyPct: null, complaintsPer10k: null }] });
  assert.equal(r.demand, null);
  assert.ok(r.reasons.some((x) => x.text === 'Sin datos de ingresos para este distrito'));
  assert.ok(r.reasons.some((x) => x.text === 'Sin datos de pobreza para este distrito'));
  assert.ok(r.reasons.some((x) => x.text === 'Sin datos de delitos para este distrito'));
});
```

The income reason shows the value rounded to a whole percent. Its tone is `up` at percentile 6.5 or more, `down` at 3.5 or less, and `info` between. Poverty and complaints keep the current HIGH/LOW rule on their inverted percentile. The SIDPOL year is `periodYear` of the period.

- [ ] **Step 2: Run them to see them fail**

Run: `node --import tsx --test lib/location/score.test.ts`
Expected: FAIL on the new reasons and types.

- [ ] **Step 3: Implement the score change, then `refresh.ts`**

`loadScoreInput` builds `districtStats` from `readLatestStats(db)` for the 43 Lima districts and stops reading the `DistrictStat` number columns. `refreshLocations` no longer reads `district-stats.csv`. Remove `syncDistrictStats` and `DISTRICT_STATS_PATH`.

- [ ] **Step 4: Drop the old columns and files**

Remove `incomePerCapitaPen`, `incomeSource`, `incomeDate`, `complaintsPer10k`, `complaintsSource`, and `complaintsDate` from `DistrictStat`. Run `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed pnpm prisma migrate dev --name drop_district_stat_numbers`. Delete the three old files.

- [ ] **Step 5: Seed and README**

`seedLocation` runs `loadStatistics(db, readStatFiles(STATS_DIR), new Date())` before its `refreshLocations`. In the README "Ubicación" section, the demand line names income strata, poverty, and complaints. Replace the last paragraph with how `data/stats/` works: one file per source and period, the notes file, `indicators.csv`, `places.csv`, `pnpm stats:load`, and that the newest period wins.

- [ ] **Step 6: Full checks**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.
Run: `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed pnpm stats:load`
Expected: the counts print. In `dptos_seed`, a San Isidro apartment has the reason `100% vive en manzanas de ingreso alto (INEI 2020)`.

- [ ] **Step 7: Commit**

```bash
git add -A lib/location lib/stats prisma scraper/src README.md data
git commit -m "feat: the location score reads district statistics; remove district-stats.csv"
```

### Task 4: INEI poverty

**Files:**
- Create: `data/stats/inei-pobreza-<year>.csv`, `data/stats/inei-pobreza-<year>.md`
- Create: `lib/stats/sense-check.ts`. Modify: `lib/stats/committed-files.test.ts`

**Interfaces:**
- Produces: `senseCheck(latest: Map<string, Map<string, LatestStat>>, indicator: string, better: 'higher' | 'lower', districts: readonly string[]): { passed: boolean; failing: string[] }`. If 6 or more of `districts` are strictly better than one of `['san-isidro', 'miraflores', 'san-borja']`, that district fails.

- [ ] **Step 1: Find the source**

Use the newest INEI district poverty map for Lima province ("Mapa de pobreza monetaria provincial y distrital"). Record the edition, the table, and the value used: the point estimate of total monetary poverty, in %. Download into its own new directory in the scratchpad. Read values from the text or page images, and check each against the page.

- [ ] **Step 2: Write the failing test**

```ts
test('every score indicator passes the sense check', () => {
  const latest = latestStats(readStatFiles(STATS_DIR));
  for (const [indicator, better] of [['high_income_pct', 'higher'], ['poverty_pct', 'lower']] as const) {
    assert.deepEqual(senseCheck(latest, indicator, better, LIMA_DISTRICT_SLUGS), { passed: true, failing: [] }, indicator);
  }
  assert.equal([...latest.values()].filter((m) => m.has('poverty_pct')).length, 43);
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --import tsx --test lib/stats/committed-files.test.ts`
Expected: FAIL, no poverty rows.

- [ ] **Step 4: Write `sense-check.ts`, the CSV, and the notes**

- [ ] **Step 5: Run the test**

Expected: PASS. If poverty fails the sense check, keep the file as context. Remove `poverty_pct` from the loop and from `loadScoreInput`, and record a ruling with the failing districts.

- [ ] **Step 6: Commit**

```bash
git add data/stats lib/stats
git commit -m "feat: INEI district poverty in the statistics"
```

### Task 5: Population and SIDPOL complaints

**Files:**
- Create: `data/stats/inei-poblacion-<year>.csv` and `.md`, `data/stats/sidpol-denuncias-<window>.csv` and `.md`
- Modify: `lib/stats/committed-files.test.ts`

- [ ] **Step 1: Population**

The newest INEI district population for the 43 districts (census or official estimate), indicator `population`.

- [ ] **Step 2: Complaints**

SIDPOL complaints by district for the latest 12 published months, from the monthly MININTER reports (for example `https://cdn.www.gob.pe/uploads/document/file/9435842/7729200-reporte-de-denuncias-registradas-en-el-sidpol-a-enero-del-2026.pdf`). `complaints_per_10k = total complaints / population × 10,000`, rounded to one decimal, period `<first month>..<last month>`. The notes file lists each report used and which crime categories are summed.

- [ ] **Step 3: Extend the test to see it fail**

Add `['complaints_per_10k', 'lower']` to the sense check loop, and assert 43 districts for `population` and `complaints_per_10k`.
Run: `node --import tsx --test lib/stats/committed-files.test.ts`
Expected: FAIL until the files exist.

- [ ] **Step 4: Write the files, run the test**

Expected: PASS, or the same fallback as Task 4 Step 5. A busy commercial district like San Isidro can have many complaints per resident. If complaints fail the sense check, keep them as context and record a ruling.

- [ ] **Step 5: Commit**

```bash
git add data/stats lib/stats
git commit -m "feat: district population and SIDPOL complaints in the statistics"
```

### Task 6: NSE A to E by Lima zone (context)

**Files:**
- Modify: `data/stats/places.csv`
- Create: `data/stats/nse-zonas-<year>.csv` and `.md`
- Modify: `lib/stats/committed-files.test.ts`

- [ ] **Step 1: Find the source**

The newest APEIM report with the NSE distribution by Lima zone. APEIM 2025 and 2023-2024 have no zone table. Look for older APEIM editions or Ipsos "Perfiles zonales". The notes name the edition and the publisher, APEIM or Ipsos.

- [ ] **Step 2: Extend the test to see it fail**

```ts
test('each NSE zone sums to about 100%', () => {
  const rows = readStatFiles(STATS_DIR).filter((r) => r.indicator.startsWith('nse_'));
  const byZone = Map.groupBy(rows, (r) => r.place);
  assert.ok(byZone.size >= 8);
  for (const [zone, zr] of byZone) assert.ok(Math.abs(zr.reduce((s, r) => s + r.value, 0) - 100) <= 1, zone);
});
```

Run: `node --import tsx --test lib/stats/committed-files.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the zones in `places.csv` and the NSE file, run the test**

If a zone includes Callao districts, it lists only its Lima districts, and the notes say so.
Expected: PASS.

- [ ] **Step 4: Full checks and commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

```bash
git add data/stats lib/stats
git commit -m "feat: NSE A to E by Lima zone as context statistics"
```

## After merge (owner's real database)

Back up `dptos` with `pg_dump`. Run both migrations as the owner: `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos pnpm prisma migrate deploy`. Then run `pnpm stats:load`.
