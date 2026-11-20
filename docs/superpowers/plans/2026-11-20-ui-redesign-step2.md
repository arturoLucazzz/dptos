# UI Redesign Step 2: Mis inversiones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the inversión workspace. It has inversiones in the database, filter and sort chips, and a large map with clusters and drawn zones. It also has cards for apartments and projects, a side panel with drag and drop and notes, Comparar, Excel export, and a phone layout.

**Architecture:** Two new tables hold inversiones and their picks. The server filters, sorts, and pages with the existing `queryDepartamentos`, extended with new sort orders, a polygon filter, and coordinates. The browser gets one page of cards and one compact point layer for the map. Inicio switches from favorites to the last opened inversión.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Prisma 7 with Postgres, `react-map-gl/maplibre` with `maplibre-gl`, `@dnd-kit/core`, `exceljs`, node:test with tsx, Playwright smoke.

**Spec:** `docs/superpowers/specs/2026-11-20-ui-redesign-design.md` (section "Mis inversiones (workspace)", "Comparar", and the builder calls). Step 1 shipped in PR #5.

## Global Constraints

- Screen text is Spanish. Dark mode only. Use the theme tokens in `app/globals.css` (`--gain`, `--loss`, `--score`, primary emerald). Icons from `lucide-react`.
- The money logic stays in `lib/departamentos-query.ts`, `lib/listing-finance.ts`, and `lib/listings.ts`. Screens never compute a money number themselves.
- Money line, exact: "Ganas S/ {n}/mes" (gain color) or "Pones S/ {n}/mes" (loss color), through `moneyLine` in `lib/home.ts`.
- The assumptions come from the cookie `dptos_supuestos` through `parseAssumptionsCookie`. Cards, the panel, Comparar, and the Excel file use them.
- Map tiles: OpenFreeMap only, style `https://tiles.openfreemap.org/styles/dark`. If that style does not load, use `https://tiles.openfreemap.org/styles/positron`. Never the standard OpenStreetMap tile servers.
- Map pins use the map's built-in clustering on one GeoJSON source. Never one React element per pin.
- Nothing is added to an inversión without a click or a drop by the owner.
- Speed targets on the owner's machine: the workspace loads in under 2 seconds, and a filter or sort change answers in under 300 ms.
- Never touch the database `dptos` during the build. Use `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed`, with the dev server on port 3100. Migrations run as `arturoLucazzz`.
- Test command: `pnpm test`. Typecheck: `pnpm typecheck`. Lint: `pnpm lint`. Smoke: `pnpm smoke:ui http://localhost:3100 /tmp/dptos-smoke`.

## Builder calls in this plan

- A drawn zone is a free polygon (click to add points, click the first point to close). The location score already scores polygons for district zones, so a new zone kind `POLYGON` reuses that path.
- Project cards show "desde S/ {price}", the project name, the district, and "Entrega {deliveryDate}" in place of the money line. A project has no money line because its price is a "from" price with no area.
- The Inicio add button adds to the last opened inversión. If no inversión exists, it creates one called "Mi inversión".
- Picks keep the order in which they were added. The panel has no reordering.
- `/favoritos` redirects to `/inversiones` after this step, because favorites move into the "Favoritos" inversión. `/zonas` stays until step 4.

## Review Focus

1. The same apartment added twice (button, drop, and map popup): it stays once in the inversión. Test in Task 1.
2. A pick whose listing is no longer published: the panel, Comparar, and the Excel file still show it, marked "Ya no está publicado", with the note. Test in Task 6.
3. A drawn polygon with fewer than 3 points, or with crossing edges: it cannot be saved, and the filter ignores it. Test in Task 5.
4. Listings with no coordinates: with no zone drawn, they show as cards. With a zone drawn, they drop out. Test in Task 2.
5. An inversión name with slashes, quotes, or accents: the Excel file name stays safe and readable. Test in Task 6.

---

### Task 1: Inversiones in the database

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_investments/migration.sql`
- Create: `lib/investments/filters.ts`, `lib/investments/filters.test.ts`
- Create: `lib/investments/store.ts`
- Create: `app/inversiones/actions.ts`

**Interfaces:**
- Consumes: `DepartamentosQueryInput`, `DepartamentosSortId` (Task 2 adds sort ids. This task types `sort` as `DepartamentosSortId`.).
- Produces:
  - `InvestmentFilters` = `{ districts: string[]; sources: SourceId[]; priceMin: number | null; priceMax: number | null; bedroomsMin: number | null; bedroomsMax: number | null; locationMin: number | null; kind: 'units' | 'projects'; sort: DepartamentosSortId; order: 'asc' | 'desc'; area: Ring | null }`
  - `DEFAULT_FILTERS`: no districts, no sources, nulls, `kind: 'units'`, `sort: 'monthlyGain'`, `order: 'desc'`, `area: null`
  - `parseInvestmentFilters(raw: unknown): InvestmentFilters`, field by field fallback to `DEFAULT_FILTERS`
  - `store.ts`: `listInvestments()`, `getInvestment(id)`, `lastOpenedInvestment()`, `createInvestment(name?: string)`, `renameInvestment(id, name)`, `deleteInvestment(id)`, `touchInvestment(id)`, `saveInvestmentFilters(id, filters)`, `addPick(id, target: { propertyId: string } | { projectId: string })`, `removePick(itemId)`, `setPickNote(itemId, note)`
  - `actions.ts`: server actions with the same names, which call the store and `revalidatePath('/')` and `revalidatePath('/inversiones')`

- [ ] **Step 1: Schema**

Add these models:
- `Investment`: `id` (cuid), `name` (String), `filters` (Json, default `{}`), `createdAt`, `updatedAt`, `lastOpenedAt` (DateTime, default now), `items`.
- `InvestmentItem`: `id`, `investmentId` (cascade delete), `propertyId` (nullable, cascade delete), `projectId` (nullable, cascade delete), `note` (String, nullable), `position` (Int), `createdAt`. Add `@@unique([investmentId, propertyId])`, `@@unique([investmentId, projectId])`, and `@@index([investmentId, position])`.

Add `POLYGON` to `ZoneKind`, and `boundary Json?` to `Zone` (rings of `[lon, lat]`, like `DistrictStat.boundary`).

- [ ] **Step 2: Migration**

Run `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed pnpm prisma migrate dev --create-only --name investments`. Then append SQL to the generated file:
- a check constraint: exactly one of `propertyId` and `projectId` is not null
- favorites: if any `Property` has `favorite = true` or `notes IS NOT NULL`, insert one `Investment` named "Favoritos"
- one item per such property, with `note = notes` and `position` in `createdAt` order

Apply it to the seed with `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed pnpm prisma migrate deploy`. Expected: the command reports that every migration is applied.

- [ ] **Step 3: Failing tests for the filters**

`lib/investments/filters.test.ts`:
- `parseInvestmentFilters(undefined)` and `parseInvestmentFilters('{bad')` equal `DEFAULT_FILTERS`.
- `{ priceMin: -5, bedroomsMin: 2.7, sort: 'nope', kind: 'x', districts: ['lince', 3] }` gives `priceMin: null`, `bedroomsMin: 3`, `sort: 'monthlyGain'`, `kind: 'units'`, `districts: ['lince']`.
- `area` with 2 points, or with points that are not number pairs, gives `area: null`. A closed ring of 4 or more valid pairs is kept.

Run: `node --import tsx --test lib/investments/filters.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement `filters.ts` and `store.ts`**

`addPick` is idempotent: if the pick exists, it returns the existing item. The next `position` is the current maximum plus 1. `setPickNote` keeps one line: it replaces line breaks with spaces, trims, and cuts at 280 characters. An empty note is stored as null. `renameInvestment` trims and cuts at 80 characters, and an empty name keeps the old name. `createInvestment()` with no name uses "Nueva inversión".

Put the note and name rules in pure helpers (`normalizeNote`, `normalizeName`) in `filters.ts`, with tests.

- [ ] **Step 5: Run tests and checks**

Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma lib/investments app/inversiones/actions.ts
git commit -m "feat: inversiones and picks in the database, favorites migrated"
```

### Task 2: Query extensions for the workspace

**Files:**
- Modify: `lib/listing-row.ts`, `lib/listings.ts`, `lib/departamentos-query.ts` and its tests
- Create: `lib/workspace-sorts.ts`, `lib/workspace-sorts.test.ts`

**Interfaces:**
- Consumes: `InvestmentFilters` (Task 1), `pointInPolygon` and `Ring` from `lib/location/geo.ts`.
- Produces:
  - `ListingRow.lat: number | null` and `ListingRow.lon: number | null`, from `Property.latitude` and `Property.longitude`. Bump the memo shape version in `lib/listings.ts`.
  - New `DEPARTAMENTOS_SORT_IDS`: `grossYield`, `cashReturn`, `pricePerM2`, `entryCost`, `newest`.
  - `DepartamentosQueryInput.area?: Ring | null`. With an area, only rows with coordinates inside it remain.
  - `WORKSPACE_SORTS: { id: DepartamentosSortId; label: string; order: 'asc' | 'desc' }[]`, in this order, with exact labels:

    | id | label | order |
    |---|---|---|
    | monthlyGain | Ganancia mensual | desc |
    | grossYield | Rentabilidad bruta | desc |
    | cashReturn | Rinde sobre efectivo | desc |
    | descuento | Bajo precio de mercado | desc |
    | pricePerM2 | Precio por m² | asc |
    | pricePen | Precio | asc |
    | entryCost | Efectivo día 1 | asc |
    | location | Ubicación | desc |
    | newest | Más nuevos | asc |

  - `filtersToQuery(f: InvestmentFilters, panel: PanelAssumptions, page: number, pageSize: number): DepartamentosQueryInput` in `lib/workspace-sorts.ts`.

- [ ] **Step 1: Failing tests**

Add to the `queryDepartamentos` tests:
- `grossYield` sorts by `grossRentPen * 12 / pricePen`, and rows with no rent come last in both orders.
- `pricePerM2` sorts by `pricePen / areaM2`, and rows with no area come last.
- `newest` sorts by `daysPublished` ascending, with nulls last.
- `area` keeps a row inside a square ring and drops a row outside it and a row with `lat: null`.
- No `area` keeps the row with `lat: null`.

`lib/workspace-sorts.test.ts`: the labels and orders above, and `filtersToQuery(DEFAULT_FILTERS, DEFAULT_PANEL, 2, 24)` gives `sort: 'monthlyGain'`, `order: 'desc'`, `page: 2`, `pageSize: 24`, `area: null`.

Run the two test files. Expected: FAIL.

- [ ] **Step 2: Implement**

Use one shared helper for the gross yield, and reuse it in `lib/home.ts` (step 1 left the formula in three places). `cashReturn` uses `yearlyGainPctOnCash`. `entryCost` uses `entryCostPen`.

- [ ] **Step 3: Run tests and checks, then commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.

```bash
git add lib
git commit -m "feat: coordinates, new sort orders, and a polygon filter in the listings query"
```

### Task 3: Project rows

**Files:**
- Create: `lib/project-rows.ts`, `lib/project-rows.test.ts`

**Interfaces:**
- Produces:
  - `ProjectRow` = `{ projectId: string; name: string; districtSlug: string; districtName: string; priceFromPen: number | null; deliveryDate: string | null; stage: string | null; imageUrl: string | null; url: string | null; lat: number | null; lon: number | null; postingIds: string[] }`
  - `loadProjectRows(): Promise<ProjectRow[]>`: live `PROJECT` sale postings grouped by `Project`, with the lowest live price as `priceFromPen`. Use the same live-posting filter as `loadSaleComparables`. Memoize it next to the sale listings memo, with the same key and invalidation.
  - `groupProjectPostings(postings): ProjectRow[]`: the pure grouping step.
  - `queryProjects(rows, f: InvestmentFilters, page, pageSize): { rows: ProjectRow[]; total: number }`. Districts, price range, and area apply. Bedrooms, sources, and location do not apply. Sorts: `pricePen` and `pricePerM2` sort by `priceFromPen`, `newest` sorts by the newest posting, and every other sort falls back to `priceFromPen` ascending.

- [ ] **Step 1: Failing tests.**
  - `groupProjectPostings`: two postings of one project give one row with the lower price. A posting with no project is dropped. A project with no price has `priceFromPen: null`.
  - `queryProjects`: the district and area filters, the sort fallback, and nulls last.
- [ ] **Step 2: Implement.** Run the focused tests. Expected: PASS.
- [ ] **Step 3:** Run `pnpm test && pnpm typecheck && pnpm lint`, then commit `feat: project rows for the workspace`.

### Task 4: The workspace without the map

**Files:**
- Create: `app/inversiones/page.tsx` (the list), `app/inversiones/[id]/page.tsx`, `app/inversiones/[id]/workspace.tsx` (client), `app/inversiones/[id]/filter-chips.tsx`, `app/inversiones/[id]/sort-chips.tsx`, `app/inversiones/[id]/pick-panel.tsx`, `components/project-card.tsx`
- Create: `app/api/inversiones/[id]/cards/route.ts`
- Create: `lib/investments/pick-view.ts`, `lib/investments/pick-view.test.ts`
- Modify: `components/listing-card.tsx`, `components/score-badge.tsx`, `components/top-bar.tsx`, `app/favoritos/page.tsx`, `scripts/smoke-ui.mjs`

**Interfaces:**
- Consumes: Tasks 1 to 3, `ListingCard`, `ScoreBadge`, `moneyLine`, `HOME_ROW_KEYS` and `toHomeRow` from `lib/home-rows.ts`.
- Produces:
  - `POST /api/inversiones/[id]/cards` with body `{ filters: InvestmentFilters; page: number }`. It returns `{ rows: CardRow[]; total: number; hasMore: boolean }`, 24 rows per page. It reads the assumptions cookie, saves the filters to the inversión, and answers 404 for an unknown id. `CardRow` is `{ type: 'unit'; row: HomeRow } | { type: 'project'; row: ProjectRow }`.
  - `PickView` = `{ itemId: string; type: 'unit' | 'project'; title: string; pricePen: number | null; districtName: string; imageUrl: string | null; money: ReturnType<typeof moneyLine>; note: string | null; gone: boolean; url: string | null; row: HomeRow | null }`
  - `toPickView(item, unit: DepartamentosRow | null, project: ProjectRow | null, fallback: { districtName: string }): PickView`. A missing row gives `gone: true` and `title` "Ya no está publicado".
  - `ListingCard` gets the props `added: boolean` and `onAdd(): void` in place of the favorites context. Draggable wiring comes in Task 7.

- [ ] **Step 1: Failing tests** for `toPickView`: a unit row maps the price, the district, and the money line. A project maps `priceFromPen` and has `money: null`. A missing row gives `gone: true` and keeps the note.
- [ ] **Step 2: Implement the list page.** `/inversiones` shows every inversión, newest `lastOpenedAt` first, with its pick count, up to 4 thumbnails, rename, and delete. Delete asks first in a dialog with the text "¿Borrar la inversión {name}? Se pierden sus elegidos y notas.". The button "+ Nueva inversión" creates one and opens it. The top bar link "Mis inversiones" goes to `/inversiones`. `/favoritos` redirects to `/inversiones`.
- [ ] **Step 3: Implement the workspace page.** The server page loads the inversión, calls `touchInvestment`, and renders the first page of cards. For an unknown id, it shows "Esta inversión no existe" with a link to `/inversiones`.
  - Filter chips: Distritos (multi select), Precio (min and max), Dormitorios (min and max), Tipo ("Departamentos" or "Proyectos"), and "Más" (sources, location minimum).
  - Sort chips from `WORKSPACE_SORTS`. A second click on the active chip flips the order.
  - Cards in a grid of 1 column on a phone, 2 at `sm`, 3 at `lg`, and 4 at `2xl`. "Ver más" loads the next page. Ignore a response that belongs to an older filter state (a request counter).
  - The side panel is on the right, sticky, `w-80`. It has the editable name, the pick count, and the picks.
  - Each pick shows a thumbnail, the price, the district, the money line, a one-line note field saved on blur, and a remove button.
  - The panel ends with "Comparar" (to `/inversiones/{id}/comparar`) and an export icon (to `/inversiones/{id}/excel`).
- [ ] **Step 4: Card fixes carried from step 1.** One `TooltipProvider` in the layout, not one per badge. On touch screens, a tap on `ScoreBadge` opens its explanation and does not open the listing. The card opens the listing through a real link, and the add button is not inside that link. An image that failed before hydration also falls back to the gradient (check `complete && naturalWidth === 0` on mount).
- [ ] **Step 5: Smoke.** Add `/inversiones` to `scripts/smoke-ui.mjs` (text "Mis inversiones" and "+ Nueva inversión"). Add a step that opens the first inversión link and expects "Comparar". Run the smoke. Expected: PASS at both sizes.
- [ ] **Step 6:** Run `pnpm test && pnpm typecheck && pnpm lint`, then commit `feat: inversiones list and workspace with chips, cards, and the pick panel`.

### Task 5: The map and drawn zones

**Files:**
- Create: `app/inversiones/[id]/workspace-map.tsx` (client, loaded with `next/dynamic` and `ssr: false`), `app/api/inversiones/[id]/points/route.ts`
- Create: `lib/location/polygon-input.ts`, `lib/location/polygon-input.test.ts`
- Modify: `lib/location/zones.ts`, `lib/location/refresh.ts`, `lib/location/zone-input.ts`, `app/zonas/actions.ts` (export the recompute step for reuse)
- Install: `pnpm add maplibre-gl react-map-gl`

**Interfaces:**
- Consumes: Tasks 1 to 4.
- Produces:
  - `POST /api/inversiones/[id]/points` with body `{ filters: InvestmentFilters }` returns `{ points: [id: string, lon: number, lat: number, gainPen: number | null][] }` for every row that matches the filters and has coordinates. The id is the `postingId` for units and the `projectId` for projects.
  - `validatePolygon(points: [number, number][]): { ok: true; ring: Ring } | { ok: false; error: string }`. It needs 3 to 50 distinct points inside the Lima bounding box and no crossing edges, and it returns a closed ring.
  - `saveDrawnZone({ name, rating, notes, ring })`: a server action that stores a `POLYGON` zone and recomputes the location scores like `/zonas` does.

- [ ] **Step 1: Failing tests.**
  - `validatePolygon` with 2 points fails with "Dibuja al menos 3 puntos."
  - A bow tie fails with "Los bordes no pueden cruzarse."
  - A point outside Lima fails with "La zona debe estar dentro de Lima."
  - A valid triangle returns a closed ring of 4 pairs.
  - Zones: a `POLYGON` zone scores a point inside it like a `DISTRICT` zone with the same rings.
- [ ] **Step 2: Implement the score side.** `refresh.ts` passes `POLYGON` zones with their `boundary` rings to the same path as district zones.
- [ ] **Step 3: Implement the map.**
  - The map is 30rem tall on a desktop, and a button "Ocultar mapa" or "Mostrar mapa" folds it. On a phone, it starts folded.
  - Points come from one GeoJSON source with `cluster: true`. Cluster circles show the count. Single points are emerald for a gain and rose for a loss.
  - The points refresh with the cards after a filter change.
  - A click on a point opens a popup with the card summary (photo, price, beds, m², money line) and a button "Agregar a la inversión". The popup data comes from the current card rows, or from the cards route with that id.
  - Saved zones show as outlines, colored by rating.
- [ ] **Step 4: Implement drawing.** "Dibujar zona" starts drawing. Each click adds a point, a click on the first point closes the polygon, and Escape cancels. A closed, valid polygon becomes `filters.area` and filters the cards and the points. "Quitar zona" clears it. "Guardar zona" opens a small form with a name, a rating from 0 to 10, and a note. Then it calls `saveDrawnZone`.
- [ ] **Step 5: Smoke and checks.** Make sure that the smoke shows the map canvas on the desktop with no console errors. Run `pnpm test && pnpm typecheck && pnpm lint`.
- [ ] **Step 6: Commit** `feat: workspace map with clusters, popups, and drawn zones`.

### Task 6: Comparar and the Excel export

**Files:**
- Create: `lib/investments/compare.ts`, `lib/investments/compare.test.ts`
- Create: `app/inversiones/[id]/comparar/page.tsx`, `app/inversiones/[id]/excel/route.ts`
- Install: `pnpm add exceljs`

**Interfaces:**
- Consumes: `PickView` and `toPickView` (Task 4), the store (Task 1).
- Produces:
  - `COMPARE_ROWS`, in this order, with exact labels and the value that wins:

    | label | wins |
    |---|---|
    | Precio | lower |
    | Precio por m² | lower |
    | Área | higher |
    | Alquiler estimado | higher |
    | Cuota del banco | lower |
    | Ganancia mensual | higher |
    | Rentabilidad bruta | higher |
    | Efectivo día 1 | lower |
    | Ubicación | higher |

  - `buildCompareTable(picks: PickView[]): { label: string; cells: { text: string; best: boolean }[] }[]`. Null values show "-" and never win. A tie marks every tied cell.
  - `excelFileName(name: string): string`.
  - `buildExcelRows(picks: PickView[]): (string | number | null)[][]`: a header row, then one row per pick with the compare values, the note, and the listing link.

- [ ] **Step 1: Failing tests:**
  - With three picks, "Precio" marks the lowest price, and "Ganancia mensual" marks the highest gain.
  - A gone pick gets "-" in every row and never wins.
  - A tie marks both cells.
  - `excelFileName('Lince / 2 dorm "final"')` equals `Lince - 2 dorm final.xlsx`, and `excelFileName('Jesús María')` equals `Jesús María.xlsx`. An empty name gives `inversion.xlsx`.
  - `buildExcelRows` puts the link in the last column, and a gone pick reads "Ya no está publicado".
- [ ] **Step 2: Implement.** The Comparar page has one column per pick and one row per number. The best value in each row is highlighted in the gain color, and the notes are at the bottom. On a phone, it shows one pick at a time, with "Anterior" and "Siguiente" buttons. "Exportar a Excel" links to the route. The route answers with the `.xlsx` content type and `Content-Disposition` with the `excelFileName` (RFC 5987 encoding for accents).
- [ ] **Step 3:** Add `/inversiones/{first id}/comparar` to the smoke through the same first-inversión step. Fetch the Excel route once with curl, and make sure that `file` reports a Microsoft Excel 2007+ file. Run the checks, then commit `feat: Comparar page and Excel export`.

### Task 7: Drag and drop and the phone layout

**Files:**
- Modify: `app/inversiones/[id]/workspace.tsx`, `app/inversiones/[id]/pick-panel.tsx`, `components/listing-card.tsx`, `components/project-card.tsx`
- Install: `pnpm add @dnd-kit/core`

**Interfaces:**
- Consumes: Tasks 4 and 5.

- [ ] **Step 1: Drag and drop.** Wrap the workspace in a `DndContext` with a pointer sensor (8 px distance) and a touch sensor (250 ms delay). Cards are draggable, and the panel is the drop area. A drop calls `addPick`. While a card is dragged, the panel shows "Suelta aquí para agregar". A card that is already in the inversión shows "Ya está en la inversión" and adds nothing.
- [ ] **Step 2: Phone layout.** Below the `lg` breakpoint, the panel becomes a bottom sheet. A bar "{n} elegidos" fixed at the bottom opens it, and the sheet holds the same picks, notes, Comparar, and export. Cards are one column, and the add button is always visible.
- [ ] **Step 3: Smoke.** Make sure that the phone screenshot of the workspace shows the "{n} elegidos" bar and one card column. Run the checks, then commit `feat: drag and drop into the panel, and the phone layout`.

### Task 8: Inicio uses inversiones

**Files:**
- Modify: `app/page.tsx`, `app/inicio/continue-card.tsx`, `app/inicio/recommendations.tsx`, `app/api/inicio/recomendados/route.ts`, `app/layout.tsx`, `app/providers.tsx`

**Interfaces:**
- Consumes: the store and actions (Task 1), `ListingCard` props (Task 4).

- [ ] **Step 1: Continuar.** It shows the last opened inversión: its name, "{n} elegidos", up to 5 thumbnails, and "Abrir" to `/inversiones/{id}`. "Otras inversiones" lists up to 4 more, each with its name and count, and "Ver todas" to `/inversiones`. "+ Nueva inversión" is now enabled, creates one, and opens it. With no inversión, Continuar reads "Todavía no tienes inversiones." with the "+ Nueva inversión" button.
- [ ] **Step 2: The add button.** On Inicio, the add button adds to the last opened inversión. If there is none, it creates "Mi inversión" first. A short toast reads "Agregado a {name}". The card shows `added` for picks of that inversión.
- [ ] **Step 3: Remove the favorites context** from the layout if nothing else uses it. `/departamentos` keeps its own favorite column until step 4. If it needs the provider, keep it there only.
- [ ] **Step 4: Smoke and checks.** Run the smoke and `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Commit `feat: Inicio continues the last inversión and adds picks to it`.
