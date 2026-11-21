# UI Feedback Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the seven feedback items of the owner, as the spec lists them.

**Architecture:** Every rule that can be tested lives in a pure module in `lib/`, with a `node:test` file next to it. The test runner only reads `lib/**`, `scraper/**`, and `prisma/**`. The React components only call those modules. The Inicio filters live in the URL through `nuqs`. One set of parsers is shared by the page, the API route, and the client.

**Tech Stack:** Next.js 16.1.6, React 19, Tailwind 4, Prisma 7, `node:test` with tsx, `nuqs` 2.10.2, react-map-gl 8.1.3 with maplibre-gl, Playwright smoke (`pnpm smoke:ui`).

**Spec:** `docs/superpowers/specs/2026-11-21-ui-feedback-design.md`

## Global Constraints

- All text on the screen is in Spanish. No English labels, buttons, or messages.
- Install `nuqs` at the exact version `2.10.2`. Add no other dependency.
- URL parameters: `precio_min`, `precio_max`, `dorm_min`, `dorm_max`, `distrito`, `area_min`, `area_max`, `fuente`, `ubicacion_min`, `orden`.
- `distrito` and `fuente` are comma lists. `orden` is a `RecoMode`.
- Column field: `min={2}` `max={6}` `step={1}`, default 4, `localStorage` key `dptos.inicio.cols`.
- Badge order: Urbania, Adondevivir, Proper, Nexo, then Remax and Manual. Labels come from `SOURCE_LABELS` in `lib/listing-card.ts`.
- Exact copy: "Columnas", "Limpiar filtros", "Ningún departamento cumple estos filtros.", "Pasa el mouse sobre un distrito", "Toca un distrito", "sin datos", "Fuente".
- No fixed light colors: no `bg-*-50`, `bg-*-100`, `bg-*-200`, `bg-white`, or `text-black` in `app/` or `components/`.
- Back up the real database `dptos` before any write to it (`pg_dump -Fc`). Run real-database commands as `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos`. Never read `.env`.
- Never run `pnpm replay --reset` on the real database.
- Use `pnpm dev --webpack` for a dev server. Turbopack runs out of memory.
- zsh has `noclobber` on: redirect with `>|`.
- Each PR passes `pnpm test && pnpm typecheck && pnpm lint` and `pnpm smoke:ui <base> <outDir>`.

## Review Focus

1. A URL with junk values (`?precio_min=abc&dorm_min=-3&distrito=nowhere`) must render Inicio with no error and no filter applied for those parameters. Pinned in Task 6 (`ignores junk values`) and Task 7 (smoke).
2. "Ver más" with filters on must keep the filters. Page 2 must not mix in rows outside the filters. Pinned in Task 6 (`serializes filters with n`) and Task 7 (smoke).
3. A listing with two copies on the same portal must show one badge, not two. Pinned in Task 4 (`one badge per portal`).
4. A district with no statistics at all must show "sin datos" in every panel line, not a crash or "NaN". Pinned in Task 9 (`all missing`).
5. A typed value in the column field such as `9`, `0`, `3.7`, or an empty field must never break the grid. Pinned in Task 2 (`nextCols` cases).

---

## PR 1: Top bar, pointer cursor, columns, Corridas colors

Branch: `feat/ui-feedback` (it already holds the spec commit).

### Task 1: Top bar links and the pointer cursor

**Files:**
- Modify: `components/top-bar.tsx`
- Modify: `app/globals.css`
- Modify: `scripts/smoke-ui.mjs`

**Interfaces:**
- Produces: nothing for later tasks.

- [ ] **Step 1: Add the smoke checks first**

In `scripts/smoke-ui.mjs`, on the `/` page at desktop width, add two checks that push to `failures`:
- The `header nav` holds exactly these link texts, in order: `Inicio`, `Mis inversiones`, `Mercado`, `Configuración`, `Corridas`. No element has `aria-label="Más"`.
- The computed `cursor` of the first enabled `main button` is `pointer`.

- [ ] **Step 2: Run the smoke to see it fail**

Build, start `pnpm start --port 3100` against `dptos_seed`, then run `pnpm smoke:ui http://localhost:3100 /tmp/dptos-smoke`.
Expected: FAIL, with the nav check and the cursor check in the failure list. Stop the server afterwards.

- [ ] **Step 3: Change the top bar**

In `components/top-bar.tsx`, put the five links in one `links` array in the order above. Remove `moreLinks`, the `Popover`, and the `MoreHorizontal` import. Give the `nav` the classes `overflow-x-auto` and `whitespace-nowrap`, so that at 360 px the page does not scroll sideways.

- [ ] **Step 4: Add the cursor rule**

In `app/globals.css`, add the `@layer base` block from spec section 2, word for word.

- [ ] **Step 5: Run the smoke again**

Run the same commands as Step 2.
Expected: the two new checks pass, and no other check fails.

- [ ] **Step 6: Commit**

```bash
git add components/top-bar.tsx app/globals.css scripts/smoke-ui.mjs
git commit -m "feat: one top bar link per page, pointer cursor on buttons"
```

### Task 2: Column number field on Inicio

**Files:**
- Create: `lib/inicio-cols.ts`, `lib/inicio-cols.test.ts`
- Modify: `app/inicio/recommendations.tsx`

**Interfaces:**
- Produces: `COLS_MIN = 2`, `COLS_MAX = 6`, `COLS_DEFAULT = 4`, `parseCols(stored: string | null): number`, `nextCols(typed: string, last: number): number`.

- [ ] **Step 1: Write the failing tests**

```ts
test('parseCols reads a stored value', () => {
  assert.equal(parseCols(null), 4);
  assert.equal(parseCols('5'), 5);
  assert.equal(parseCols('abc'), 4);
  assert.equal(parseCols('9'), 6);
  assert.equal(parseCols('1'), 2);
});
test('nextCols clamps and rounds what the person types', () => {
  assert.equal(nextCols('9', 4), 6);
  assert.equal(nextCols('0', 4), 2);
  assert.equal(nextCols('3.7', 4), 4);
  assert.equal(nextCols('', 5), 5);
  assert.equal(nextCols('-', 3), 3);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --import tsx --test lib/inicio-cols.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement `parseCols` and `nextCols` in `lib/inicio-cols.ts`**

Both round to the nearest integer, then clamp to 2..6. A value that is not a finite number gives the default (`parseCols`) or `last` (`nextCols`).

- [ ] **Step 4: Run the tests**

Run: `node --import tsx --test lib/inicio-cols.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the buttons in `app/inicio/recommendations.tsx`**

Remove the `COLS` array and the five buttons. Show a `<label>` "Columnas" with `<input type="number" min={2} max={6} step={1}>`, `w-14`, inside `hidden sm:flex`, only in the card view. On change, store `String(nextCols(e.target.value, cols))` with the existing `remember(COLS_KEY, …)`. Read the value with `parseCols(usePref(COLS_KEY))`.

- [ ] **Step 6: Run the whole suite and commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

```bash
git add lib/inicio-cols.ts lib/inicio-cols.test.ts app/inicio/recommendations.tsx
git commit -m "feat: a number field for cards per row on Inicio"
```

### Task 3: Dark theme colors on Corridas and across the app

**Files:**
- Modify: `lib/run-labels.ts`, `lib/run-labels.test.ts`
- Create: `lib/theme-scan.test.ts`
- Modify: `app/runs/runs-client.tsx`, `app/globals.css`, and every file that the scan finds

**Interfaces:**
- Produces: `runStatusTone(status: string): string` in `lib/run-labels.ts`.

- [ ] **Step 1: Write the failing tests**

In `lib/run-labels.test.ts`:

```ts
test('runStatusTone uses theme tokens', () => {
  assert.equal(runStatusTone('SUCCESS'), 'bg-gain/15 text-gain');
  assert.equal(runStatusTone('PARTIAL'), 'bg-warn/15 text-warn');
  assert.equal(runStatusTone('FAILED'), 'bg-loss/15 text-loss');
  assert.equal(runStatusTone('RUNNING'), 'bg-primary/15 text-primary');
  assert.equal(runStatusTone('OTHER'), '');
});
```

In `lib/theme-scan.test.ts`, a test named `no fixed light colors in app or components`. It reads every `.tsx` and `.ts` file under `app/` and `components/` with `node:fs`. It fails with the file name and the match for each hit of `/\b(bg|border)-[a-z]+-(50|100|200)\b|\bbg-white\b|\btext-black\b/`.

- [ ] **Step 2: Run them to see them fail**

Run: `node --import tsx --test lib/run-labels.test.ts lib/theme-scan.test.ts`
Expected: FAIL. `runStatusTone` is missing, and the scan lists at least `app/runs/runs-client.tsx`.

- [ ] **Step 3: Add the token and the function**

In `app/globals.css`, add `--warn: #fbbf24;` next to `--gain` and `--loss`, and `--color-warn: var(--warn);` next to `--color-gain`. Add `runStatusTone` to `lib/run-labels.ts`. In `app/runs/runs-client.tsx`, delete the local `statusTone` and use `runStatusTone`. Change the amber badges to `bg-warn/15 text-warn`, and the amber box to `border-warn/40 bg-warn/10`.

- [ ] **Step 4: Fix every other file the scan lists**

Use the same tokens: `gain` for good, `warn` for caution, `loss` for bad, `muted` or `card` for neutral surfaces.

- [ ] **Step 5: Run the tests, the suite, and the smoke**

Run: `pnpm test && pnpm typecheck && pnpm lint`, then the smoke as in Task 1.
Expected: all pass. Look at the `/runs` screenshot in the smoke output folder: no white or pale badges.

- [ ] **Step 6: Commit, open PR 1, and merge it**

```bash
git add -A lib/run-labels.ts lib/run-labels.test.ts lib/theme-scan.test.ts app components
git commit -m "fix: Corridas and the rest of the app use the dark theme colors"
git push -u origin feat/ui-feedback
gh pr create --base main --title "Feedback 1: top bar, cursor, columnas y colores de Corridas"
gh pr merge --merge
git switch main && git pull --ff-only
```

The PR body is in Spanish and lists what changed and how to test it.

---

## PR 2: Source badges and filters on Inicio

Branch: `feat/inicio-filtros`, from the updated `main`.

### Task 4: Source badges

**Files:**
- Create: `lib/source-badges.ts`, `lib/source-badges.test.ts`, `components/source-badges.tsx`
- Modify: `lib/home-rows.ts`, `lib/home-rows.test.ts`, `lib/project-rows.ts`, `components/listing-card.tsx`, `components/project-card.tsx`, `app/inicio/recommendations.tsx`

**Interfaces:**
- Consumes: `SOURCE_IDS`, `SOURCE_LABELS`, `SourceId` from `lib/listing-card.ts`. The `copies` of a listing: `{ postingId; source: SourceId | null; url: string | null; pricePen }[]`.
- Produces: `type SourceBadge = { source: SourceId; label: string; url: string | null }`, `sourceBadges(copies: { source: SourceId | null; url: string | null }[]): SourceBadge[]`, `HomeRow.sources: SourceBadge[]`, `ProjectRow.sources: SourceBadge[]`, and the component `<SourceBadges badges={SourceBadge[]} />`.

- [ ] **Step 1: Write the failing tests**

```ts
test('one badge per portal, in the fixed order', () => {
  const b = sourceBadges([
    { source: 'nexo', url: 'https://n/1' },
    { source: 'urbania', url: null },
    { source: 'urbania', url: 'https://u/2' },
    { source: null, url: 'https://x' },
  ]);
  assert.deepEqual(b, [
    { source: 'urbania', label: 'Urbania', url: 'https://u/2' },
    { source: 'nexo', label: 'Nexo', url: 'https://n/1' },
  ]);
});
test('no copies gives no badges', () => assert.deepEqual(sourceBadges([]), []));
```

In `lib/home-rows.test.ts`, add a test that `toHomeRow` of a row with two copies (`adondevivir`, `urbania`) gives `sources` with Urbania first.

- [ ] **Step 2: Run them to see them fail**

Run: `node --import tsx --test lib/source-badges.test.ts lib/home-rows.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`sourceBadges` keeps the first non-null URL of each portal and sorts by the index in `SOURCE_IDS`. `toHomeRow` sets `sources: sourceBadges(row.copies)`. `ProjectRow` gets `sources`, built with `sourceBadges` from the project's postings and their URLs, which `lib/project-rows.ts` already reads.

- [ ] **Step 4: Run the tests**

Run: `node --import tsx --test lib/source-badges.test.ts lib/home-rows.test.ts`
Expected: PASS.

- [ ] **Step 5: Show the badges**

`components/source-badges.tsx` shows each badge as a small rounded `text-[10px]` pill with `border-border bg-muted text-muted-foreground`. A badge with a URL is an `<a target="_blank" rel="noopener noreferrer">`, and its click calls `e.stopPropagation()` so that the card link does not fire. Place it under the district line on `ListingCard` and `ProjectCard`. On the Inicio table, add a "Fuente" column after "Departamento".

- [ ] **Step 6: Run the suite and commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

```bash
git add lib/source-badges.ts lib/source-badges.test.ts components/source-badges.tsx lib/home-rows.ts lib/home-rows.test.ts lib/project-rows.ts components/listing-card.tsx components/project-card.tsx app/inicio/recommendations.tsx
git commit -m "feat: source badges on cards and a Fuente column"
```

### Task 5: Area filter in the listing query

**Files:**
- Modify: `lib/departamentos-query.ts`, `lib/departamentos-query.test.ts`

**Interfaces:**
- Produces: `areaM2Min?: number | null` and `areaM2Max?: number | null` on `DepartamentosQueryInput`, and both in `ListingFilterInput`.

Ruling: the spec names these `areaMin` and `areaMax`. The query already has `area`, which is a drawn polygon. The names `areaM2Min` and `areaM2Max` avoid that clash. The URL names stay `area_min` and `area_max`.

- [ ] **Step 1: Write the failing test**

`filterListings keeps rows inside the m² range`: three listings with `areaM2` 40, 70, and `null`. With `areaM2Min: 50, areaM2Max: 80`, only the 70 row stays. With `areaM2Min: 50` alone, the `null` row is dropped.

- [ ] **Step 2: Run it to see it fail**

Run: `node --import tsx --test lib/departamentos-query.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `filterListings`, next to the bedroom filter, with the same null rule.**

- [ ] **Step 4: Run it**

Run: `node --import tsx --test lib/departamentos-query.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/departamentos-query.ts lib/departamentos-query.test.ts
git commit -m "feat: filter listings by area in m²"
```

### Task 6: Shared URL filter parsers

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (install `nuqs@2.10.2` exactly)
- Create: `lib/home-filters.ts`, `lib/home-filters.test.ts`
- Modify: `lib/home-universe.ts`, `lib/home-rows.ts`, `app/api/inicio/recomendados/route.ts`

**Interfaces:**
- Consumes: `areaM2Min`, `areaM2Max` (Task 5), `RECO_TABS` and `RecoMode` from `lib/home.ts`, `SOURCE_IDS`.
- Produces:
  - `homeFilterParsers`: the `nuqs` parser map, imported from `nuqs/server` so that server and client can share it. Keys are the URL names from Global Constraints. `orden` defaults to `'gain'`.
  - `type HomeFilters = inferParserType<typeof homeFilterParsers>`
  - `loadHomeFilters = createLoader(homeFilterParsers)`
  - `serializeHomeFilters = createSerializer(homeFilterParsers)`
  - `type HomeListingFilter = ListingFilterInput & { areaM2Min: number | null; areaM2Max: number | null }`
  - `toListingFilter(f: HomeFilters, knownDistricts: Set<string>): HomeListingFilter`
  - `hasActiveFilters(f: HomeFilters): boolean`. If any key except `orden` is set, it returns true.
  - `loadHomeRows(panel: PanelAssumptions, filter?: Partial<HomeListingFilter>): Promise<DepartamentosRow[]>`

- [ ] **Step 1: Install**

Run: `pnpm add nuqs@2.10.2 --save-exact`
Expected: `package.json` has `"nuqs": "2.10.2"`.

- [ ] **Step 2: Write the failing tests**

```ts
test('reads filters from the URL', () => {
  const f = loadHomeFilters('?precio_min=200000&precio_max=400000&dorm_min=2&distrito=lince,miraflores&fuente=urbania&orden=yield');
  assert.equal(f.precio_min, 200000);
  assert.deepEqual(f.distrito, ['lince', 'miraflores']);
  assert.deepEqual(f.fuente, ['urbania']);
  assert.equal(f.orden, 'yield');
});
test('ignores junk values', () => {
  const f = loadHomeFilters('?precio_min=abc&fuente=ebay&orden=nope');
  const q = toListingFilter(f, new Set(['lince']));
  assert.equal(q.priceMin, null);
  assert.deepEqual(q.sources, []);
  assert.equal(f.orden, 'gain');
});
test('drops unknown districts and negative numbers', () => {
  const q = toListingFilter(loadHomeFilters('?distrito=lince,nowhere&dorm_min=-3'), new Set(['lince']));
  assert.deepEqual(q.districts, ['lince']);
  assert.equal(q.bedroomsMin, null);
});
test('swaps a min above the max', () => {
  const q = toListingFilter(loadHomeFilters('?area_min=90&area_max=50'), new Set());
  assert.equal(q.areaM2Min, 50);
  assert.equal(q.areaM2Max, 90);
});
test('serializes filters with n', () => {
  const s = serializeHomeFilters('/api/inicio/recomendados?n=24', { dorm_min: 2, distrito: ['lince'] });
  assert.match(s, /n=24/);
  assert.match(s, /dorm_min=2/);
  assert.match(s, /distrito=lince/);
});
test('hasActiveFilters ignores the tab', () => {
  assert.equal(hasActiveFilters(loadHomeFilters('?orden=yield')), false);
  assert.equal(hasActiveFilters(loadHomeFilters('?dorm_min=1')), true);
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `node --import tsx --test lib/home-filters.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement `lib/home-filters.ts` and wire the server side**

Use `parseAsInteger` for the prices, bedrooms, areas, and location. Use `parseAsArrayOf(parseAsString)` for `distrito`, `parseAsArrayOf(parseAsStringLiteral(SOURCE_IDS))` for `fuente`, and `parseAsStringLiteral(RECO_TABS.map((t) => t.mode)).withDefault('gain')` for `orden`. In `toListingFilter`, a negative number becomes `null`, and an array drops only its invalid items. If a min is larger than its max, swap the two.

Change `loadHomeRows` to spread `filter` into the `queryDepartamentos` input. Change the API route to read `loadHomeFilters(request.url)` and pass `toListingFilter(...)` to `loadHomeRows`. The known districts come from the unfiltered universe. `parseRecoParams` keeps reading `n`, and it reads the mode from `orden`. It still accepts `mode`, for old links.

- [ ] **Step 5: Run the tests and the suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/home-filters.ts lib/home-filters.test.ts lib/home-universe.ts lib/home-rows.ts app/api/inicio/recomendados/route.ts
git commit -m "feat: URL filter parsers for Inicio, shared by page, API and client"
```

### Task 7: Filter row on Inicio

**Files:**
- Create: `components/filters/chip.tsx`, `components/filters/range-fields.tsx`, `components/filters/option-list.tsx`, `app/inicio/home-filters.tsx`
- Modify: `app/inversiones/[id]/filter-chips.tsx` (import the moved parts), `app/layout.tsx`, `app/page.tsx`, `app/inicio/recommendations.tsx`, `scripts/smoke-ui.mjs`

**Interfaces:**
- Consumes: everything Task 6 produces.
- Produces: `<HomeFilters districtOptions={{ value: string; label: string }[]} />`, a client component.

- [ ] **Step 1: Add the smoke checks first**

In `scripts/smoke-ui.mjs`:
- Open `/?dorm_min=2&dorm_max=2`. Every card's text holds `2 dorm`. When "Ver más" shows, click it, and check the same for the new cards.
- Open `/?precio_min=abc&distrito=nowhere`. The page shows "Recomendados" and no page error.
- Open `/?precio_min=999999999`. The page shows "Ningún departamento cumple estos filtros." and a "Limpiar filtros" button. After a click on it, the URL has no `precio_min`, and cards show.

- [ ] **Step 2: Run the smoke to see it fail**

Run the smoke as in Task 1.
Expected: FAIL on the new checks.

- [ ] **Step 3: Move the shared chip parts**

Move `Chip`, `RangeFields`, and the district and source lists from `app/inversiones/[id]/filter-chips.tsx` to `components/filters/`. The workspace imports them from there, and its behavior does not change.

- [ ] **Step 4: Build the filter row**

- `app/layout.tsx` wraps the body content in `NuqsAdapter` from `nuqs/adapters/next/app`.
- `app/page.tsx` takes `searchParams` and calls `loadHomeFilters`. It builds the first page with `toListingFilter` and `recommendHome(rows, filters.orden, RECO_FIRST)`. It passes `districtOptions` and the first page to the client. The options are the districts of the unfiltered universe, sorted by name.
- `app/inicio/home-filters.tsx` uses `useQueryStates(homeFilterParsers, { shallow: true })`. It shows the chips Precio, Dormitorios, Distrito, Área, Fuente, and Ubicación in one `flex flex-wrap` row. When `hasActiveFilters` is true, it also shows "Limpiar filtros".
- `app/inicio/recommendations.tsx` reads the same `useQueryStates`. When the filters or `orden` change, it fetches `serializeHomeFilters('/api/inicio/recomendados?n=16', filters)`. "Ver más" fetches with `n = list.length + 8` and the same filters. The tabs write `orden`. With no rows, it shows "Ningún departamento cumple estos filtros." and the "Limpiar filtros" button.
- The KPI strip stays unfiltered.

- [ ] **Step 5: Run the suite and the smoke**

Run: `pnpm test && pnpm typecheck && pnpm lint`, then the smoke.
Expected: all pass, including the investment workspace flow that the smoke already covers.

- [ ] **Step 6: Commit, open PR 2, and merge it**

```bash
git add -A components/filters app/inicio app/page.tsx app/layout.tsx app/inversiones scripts/smoke-ui.mjs
git commit -m "feat: price, bedroom, district, area, source and location filters on Inicio"
git push -u origin feat/inicio-filtros
gh pr create --base main --title "Feedback 2: fuentes por aviso y filtros en Inicio"
gh pr merge --merge
git switch main && git pull --ff-only
```

---

## PR 3: District panel and INEI strata

Branch: `feat/mapa-panel`, from the updated `main`.

### Task 8: INEI strata data

**Files:**
- Modify: `data/stats/inei-estratos-2020.csv`, `data/stats/inei-estratos-2020.md`, `data/stats/indicators.csv`, `lib/stats/store.ts`
- Create: `data/stats/inei-estratos-2020-rangos.csv`, `lib/stats/strata.ts`, `lib/stats/strata.test.ts`
- Possibly modify: `data/stats/apeim-nse-2025.csv`, `data/stats/apeim-nse-2025.md`

**Interfaces:**
- Produces: `STRATA = ['alto', 'medio_alto', 'medio', 'medio_bajo', 'bajo'] as const`, `type StratumRange = { stratum: (typeof STRATA)[number]; minPen: number; maxPen: number | null }`, `parseStrataRanges(text: string): StratumRange[]`, and the indicators `stratum_<name>_pct`.

- [ ] **Step 1: Read the source**

Open the INEI PDF named in `data/stats/inei-estratos-2020.md`. For each of the 43 districts, record the share of population in each of the 5 strata and the page number. Record the per-capita income range of each stratum and its page. If a district page has no split, leave that district out and list it in the `.md` file. Never guess a value.

Also read the APEIM 2025 síntesis named in `data/stats/apeim-nse-2025.md`. If it gives an average monthly household income per level for Lima, record it as `nse_<level>_income_pen` rows with the page. If it does not, write that in the `.md` file.

- [ ] **Step 2: Write the failing tests**

In `lib/stats/strata.test.ts`, reading the real files under `data/stats/`:
- `strata shares add up per district`: each place with any `stratum_*` row has all 5 rows, and their sum is between 99 and 101.
- `alto matches high_income_pct`: for each such place, `stratum_alto_pct` equals `high_income_pct` within 0.05.
- `ranges cover the 5 strata`: `parseStrataRanges` of the rangos file gives 5 rows in `STRATA` order. `maxPen` is `null` only for `alto`, and the `minPen` of each stratum is above the `maxPen` of the stratum below it.

- [ ] **Step 3: Run them to see them fail**

Run: `node --import tsx --test lib/stats/strata.test.ts`
Expected: FAIL, because the rows and the module do not exist.

- [ ] **Step 4: Add the data and the parser**

Add the rows to `inei-estratos-2020.csv` with the same `period` and `source` as the existing rows, and a per-district `source_ref`. Add the 5 indicator definitions to `indicators.csv`, with unit `%` and the Spanish labels "Estrato alto" to "Estrato bajo". Write the rangos file with the header `stratum,min_pen,max_pen,unit,source,source_ref`. Add `inei-estratos-2020-rangos.csv` to `CATALOG_FILES` in `lib/stats/store.ts`, so that `stats:load` does not read it as a stat file. Implement `parseStrataRanges`.

- [ ] **Step 5: Run the tests and the suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 6: Load into the real database, after a backup**

```bash
pg_dump -Fc postgresql://arturoLucazzz@localhost:5432/dptos >| data/backups/dptos-before-strata-2026-11-21.dump
DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos pnpm stats:load
```

Expected: the load reports the new indicator counts and no error.

- [ ] **Step 7: Commit**

```bash
git add data/stats lib/stats
git commit -m "data: INEI 2020 income strata per district, with income ranges"
```

### Task 9: District panel model

**Files:**
- Create: `lib/district-panel.ts`, `lib/district-panel.test.ts`
- Modify: `lib/district-map.ts`, `lib/district-map.test.ts`, `lib/district-map-load.ts`

**Interfaces:**
- Consumes: `DistrictMarket` from `lib/market-dashboard.ts`, `ConstructionPipeline` from `lib/analytics.ts`, `StratumRange` and `STRATA` (Task 8).
- Produces:
  - `PANEL_STATS = ['population', 'poverty_pct', 'complaints_per_10k', 'stratum_alto_pct', 'stratum_medio_alto_pct', 'stratum_medio_pct', 'stratum_medio_bajo_pct', 'stratum_bajo_pct'] as const`. `DistrictProps` gets these keys as `number | null`, filled in `buildDistrictFeatures` from the district's own place.
  - `loadDistrictMap` also returns `strataRanges: StratumRange[]`.
  - `type PanelLine = { label: string; value: string }`, `type PanelStratum = { label: string; range: string; pct: number | null }`, `type DistrictPanel = { title: string; zone: string | null; lines: PanelLine[]; market: PanelLine[] | null; strata: PanelStratum[]; sources: string }`
  - `districtPanel(props: DistrictProps, market: DistrictMarket | undefined, construction: ConstructionPipeline | undefined, ranges: StratumRange[]): DistrictPanel`

- [ ] **Step 1: Write the failing tests**

```ts
test('full district', () => {
  const p = districtPanel(props({ population: 99000, stratum_alto_pct: 55, zone_household_income_pen: 12500 }), market({ typicalSalePen: 650000, typicalRentPen: 3200, grossYieldPct: 5.9, saleCount: 812 }), pipeline({ total: 42 }), RANGES);
  assert.equal(p.title, 'Miraflores');
  assert.deepEqual(p.lines.find((l) => l.label === 'Población'), { label: 'Población', value: '99 mil' });
  assert.deepEqual(p.lines.find((l) => l.label === 'Proyectos activos'), { label: 'Proyectos activos', value: '42' });
  assert.equal(p.market?.find((l) => l.label === 'Rentabilidad bruta')?.value, '5.9 %');
  assert.equal(p.strata[0].label, 'Alto');
  assert.equal(p.strata[0].pct, 55);
  assert.match(p.strata[0].range, /^S\/ [\d,]+ o más$/);
});
test('all missing', () => {
  const p = districtPanel(props({}), undefined, undefined, []);
  assert.equal(p.market, null);
  for (const l of p.lines) assert.equal(l.value, 'sin datos');
  for (const s of p.strata) { assert.equal(s.pct, null); assert.equal(s.range, 'sin datos'); }
});
test('zero projects reads 0, not sin datos', () => {
  assert.equal(districtPanel(props({}), undefined, pipeline({ total: 0 }), []).lines.find((l) => l.label === 'Proyectos activos')?.value, '0');
});
```

`props`, `market`, and `pipeline` are small builders in the test file. Every field is `null` or `0` by default, and `props` has the name "Miraflores". `RANGES` holds the 5 ranges from the rangos file. If `market` is `undefined`, the market block is `null`. Only the tracked districts have a market.

Line labels, in order: "Población", "Proyectos activos", "Ingreso promedio del hogar (zona)", "Pobreza monetaria", "Denuncias por 10 mil habitantes". Market labels: "Avisos en venta", "Precio típico", "Alquiler típico", "Rentabilidad bruta". Stratum labels: "Alto", "Medio alto", "Medio", "Medio bajo", "Bajo". A range reads `S/ a - b` or `S/ a o más`, with `es-PE` number grouping. Use `formatMetricValue` and the existing money format where they fit.

- [ ] **Step 2: Run them to see them fail**

Run: `node --import tsx --test lib/district-panel.test.ts lib/district-map.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the model and the new props.**

- [ ] **Step 4: Run the tests and the suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/district-panel.ts lib/district-panel.test.ts lib/district-map.ts lib/district-map.test.ts lib/district-map-load.ts
git commit -m "feat: district panel model with population, projects, market and strata"
```

### Task 10: Panel beside the map

**Files:**
- Create: `app/mercado/district-panel.tsx`
- Modify: `app/mercado/district-map-view.tsx`, `app/mercado/district-map.tsx`, `app/mercado/page.tsx`, `app/mercado/nse-bars.tsx` (if Task 8 found APEIM incomes), `scripts/smoke-ui.mjs`

**Interfaces:**
- Consumes: `districtPanel` and `DistrictPanel` (Task 9), `m.districts` and `m.construction` from `loadMarketDashboard`, and `map.strataRanges`.

- [ ] **Step 1: Add the smoke check first**

On `/mercado` at desktop width, the text "Pasa el mouse sobre un distrito" shows. After a hover on the center of the map canvas, the panel shows the label "Población".

- [ ] **Step 2: Run the smoke to see it fail**

Expected: FAIL on the new check.

- [ ] **Step 3: Build the panel**

- `app/mercado/page.tsx` passes `market={m.districts}`, `construction={m.construction}`, and `strataRanges={map.strataRanges}` to `DistrictMap`. The section grid keeps `lg:grid-cols-[2fr_1fr]`, now with the map and the panel. The NSE bars move under the map, at full width.
- `district-map-view.tsx` removes the `Popup`. A hover sets the selected district, and a mouse leave does not clear it. A tap on a touch screen also sets it. It renders `<DistrictPanel panel={...} />` beside the map.
- `district-panel.tsx` shows the title and zone, the lines, and the market block if there is one. It shows the 5 strata as bars (`bg-primary`, width = pct), with the range under each label. The source line uses `text-xs text-muted-foreground`. Before any selection, it shows one hint. If `matchMedia('(hover: hover)')` matches, the hint is "Pasa el mouse sobre un distrito". If not, it is "Toca un distrito".
- If Task 8 recorded APEIM incomes, `nse-bars.tsx` shows the income under each level. Otherwise it does not change.

- [ ] **Step 4: Run the suite and the smoke, and look at the screenshots**

Run: `pnpm test && pnpm typecheck && pnpm lint`, then the smoke.
Expected: all pass. The `/mercado` screenshots show the panel beside the map at desktop width and under the map at phone width, with no sideways scroll.

- [ ] **Step 5: Commit, open PR 3, and merge it**

```bash
git add -A app/mercado scripts/smoke-ui.mjs
git commit -m "feat: district panel beside the Mercado map"
git push -u origin feat/mapa-panel
gh pr create --base main --title "Feedback 3: panel del distrito en el mapa con estratos del INEI"
gh pr merge --merge
git switch main && git pull --ff-only
```

### Task 11: Final check on the production build

- [ ] **Step 1: Rebuild and restart the production server on port 3000 against the real database.**

Stop the running `pnpm start --port 3000` first. Then run `pnpm build` and start it again.

- [ ] **Step 2: Run the smoke and the English scan against `http://localhost:3000`.**

Expected: all checks pass, and the scan finds no English text.
