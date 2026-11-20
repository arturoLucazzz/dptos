# UI Redesign Step 1: Base and Inicio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app the approved dark look, the new navigation, and a settings window whose assumptions recalculate every number. Build an Inicio page with market numbers, the inversión to continue, and recommended deals.

**Architecture:** Assumptions move from URL parameters to a cookie that both the server and the browser read. Inicio is a server page that runs the existing `queryDepartamentos` with the cookie's assumptions. Pure, tested helpers compute four market numbers and five recommendation lists, and client components show them. A Playwright smoke script checks the pages in a real browser.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Radix (existing `components/ui`), `lucide-react` (installed), `next/font/google` (Inter), Playwright (installed), node:test with tsx.

**Spec:** `docs/superpowers/specs/2026-11-20-ui-redesign-design.md`, step 1 of 4.

## Global Constraints

- Screen text is Spanish. Dark mode only.
- Colors, as semantic tokens in `app/globals.css`:
  - background `#0b0d11`, card and popover `#15181e`, secondary and muted surfaces `#1a1e25`, border and input `#262b33`
  - foreground `#f3f4f6`, muted-foreground `#939aa6`
  - primary (brand, actions) `#10b981` with primary-foreground `#052e1f`
  - new tokens: `--gain: #34d399`, `--loss: #fb7185`, `--score: #8b5cf6`
- Font: Inter through `next/font/google`. Icons: `lucide-react`.
- Navigation labels, exact: "Inicio", "Mis inversiones", "Mercado".
- Money line, exact, with numbers in `es-PE` grouping:
  - monthly gain of 0 or more: "Ganas S/ {n}/mes" in the gain color
  - monthly gain below 0: "Pones S/ {n}/mes" in the loss color
- Assumptions defaults are the app's own `DEFAULT_PANEL` (TEA 8%, TCEA 9%, inicial 10%, 20 años). Pill text, exact: `Supuestos: TEA {tea}% · inicial {downPaymentPct}% · {termYears} años`.
- Never touch the database `dptos` during the build. Use `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed` and a dev server on port 3100.
- Test command: `pnpm test`. Typecheck: `pnpm typecheck`. Lint: `pnpm lint`.

## Review Focus

1. A cookie edited by hand, cut short, or from an older version (bad JSON, TEA of 500, a missing field): every page still renders with defaults for the bad fields. Test in Task 1.
2. A URL from the old app with `?tea=7&inicial=20`: the URL wins over the cookie, so old bookmarks keep their numbers. Test in Task 1.
3. Listings with no rent estimate or no location score: they sort last in every recommendation tab instead of first or crashing. Test in Task 3.
4. A listing with no photo: the card shows a neutral placeholder, not a broken image. Check in Task 4's smoke.
5. Fewer listings than the requested count (a fresh seed): "Ver más" disappears instead of adding empty rows. Test in Task 3.

---

### Task 1: Assumptions cookie

**Files:**
- Create: `lib/assumptions-cookie.ts`, `lib/assumptions-cookie.test.ts`
- Modify: `lib/departamentos-query.ts` (`parseDepartamentosSearchParams` gains a fallback), `app/api/departamentos/route.ts`

**Interfaces:**
- Produces:
  - `ASSUMPTIONS_COOKIE = 'dptos_supuestos'`
  - `parseAssumptionsCookie(raw: string | undefined): PanelAssumptions`. JSON with the `PanelAssumptions` keys. If a field is missing or out of range, it falls back to `DEFAULT_PANEL`. Ranges:
    - `tea` 1 to 30, `tcea` 1 to 35, `downPaymentPct` 0 to 100
    - `termYears` 1 to 40, integer
    - `cashAvailablePen` null or 0 and up, `extraMonthlyPen` 0 and up
  - `serializeAssumptions(a: PanelAssumptions): string`
  - `assumptionsLabel(a: PanelAssumptions): string`, the pill text.
  - `parseDepartamentosSearchParams(params: URLSearchParams, fallback?: PanelAssumptions): DepartamentosQueryInput`. URL values win, then `fallback`, then `DEFAULT_PANEL`.

- [ ] **Step 1: Write the failing tests in `lib/assumptions-cookie.test.ts`**

```ts
test('a missing or broken cookie gives the defaults', () => {
  assert.deepEqual(parseAssumptionsCookie(undefined), DEFAULT_PANEL);
  assert.deepEqual(parseAssumptionsCookie('{not json'), DEFAULT_PANEL);
});

test('out-of-range and missing fields fall back one by one', () => {
  const a = parseAssumptionsCookie(JSON.stringify({ tea: 500, downPaymentPct: 20, termYears: 25.5 }));
  assert.equal(a.tea, DEFAULT_PANEL.tea);
  assert.equal(a.downPaymentPct, 20);
  assert.equal(a.termYears, DEFAULT_PANEL.termYears);
  assert.equal(a.tcea, DEFAULT_PANEL.tcea);
});

test('serialize and parse round-trip', () => {
  const a = { ...DEFAULT_PANEL, tea: 9.5, cashAvailablePen: 150000 };
  assert.deepEqual(parseAssumptionsCookie(serializeAssumptions(a)), a);
});

test('the pill label', () => {
  assert.equal(assumptionsLabel({ ...DEFAULT_PANEL, tea: 8.5, downPaymentPct: 20 }), 'Supuestos: TEA 8.5% · inicial 20% · 20 años');
});

test('URL parameters win over the cookie fallback', () => {
  const fallback = { ...DEFAULT_PANEL, tea: 9.5, downPaymentPct: 30 };
  const a = parseDepartamentosSearchParams(new URLSearchParams('tea=7'), fallback);
  assert.equal(a.panel.tea, 7);
  assert.equal(a.panel.downPaymentPct, 30);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --import tsx --test lib/assumptions-cookie.test.ts`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement, then make the API route read the cookie**

`app/api/departamentos/route.ts` passes `parseAssumptionsCookie((await cookies()).get(ASSUMPTIONS_COOKIE)?.value)` as the fallback.

- [ ] **Step 4: Run the tests to see them pass, then the suite**

Run: `node --import tsx --test lib/assumptions-cookie.test.ts && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib app/api/departamentos
git commit -m "feat: assumptions in a cookie, with URL parameters still winning"
```

### Task 2: Theme, navigation, and the settings window

**Files:**
- Modify: `app/globals.css` (token values and three new tokens), `app/layout.tsx` (Inter, wider main), `components/top-bar.tsx`
- Create: `components/assumptions-dialog.tsx`, `scripts/smoke-ui.mjs`
- Modify: `package.json` (script `smoke:ui`)

**Interfaces:**
- Consumes: Task 1 (`ASSUMPTIONS_COOKIE`, `parseAssumptionsCookie`, `serializeAssumptions`, `assumptionsLabel`).
- Produces: `AssumptionsDialog({ initial: PanelAssumptions })`, rendered by the top bar. Tailwind classes `text-gain`, `text-loss`, `bg-score` from the new tokens.

- [ ] **Step 1: Write the smoke script and see it fail**

`scripts/smoke-ui.mjs <baseUrl> <outDir>` opens each path in headless Chromium (Playwright) at 1440×900 and at 390×844. It fails (exit 1) on any page error, any console error, or a missing expected text, and saves a screenshot per path and size. Expected texts per path:
- `/`: "Inicio", "Mis inversiones", "Mercado", "Supuestos: TEA", "Recomendados"
- `/departamentos`: "Supuestos: TEA"

Script: `"smoke:ui": "node scripts/smoke-ui.mjs"`.

Run, with the seed dev server on port 3100: `pnpm smoke:ui http://localhost:3100 /tmp/dptos-smoke`
Expected: FAIL on "Recomendados" and "Supuestos: TEA".

- [ ] **Step 2: Theme and navigation**

- Replace the `:root` color values with the Global Constraints colors. Add `--gain`, `--loss`, `--score` and map them in `@theme inline` as `--color-gain`, `--color-loss`, `--color-score`.
- Inter through `next/font/google` on `<body>`. The main container becomes `max-w-screen-2xl`.
- The top bar, from left to right:
  - the logo "dptos", with a small emerald square that holds a "d"
  - "Inicio" (`/`), "Mis inversiones" (`/departamentos` until step 2), and "Mercado" (`/estadisticas` until step 3)
  - the assumptions pill on the right The active link is highlighted. Other current links move into a "Más" menu: Favoritos, Zonas, Alertas, Agregar, Corridas.

- [ ] **Step 3: The settings window**

`AssumptionsDialog` opens from the pill, using `components/ui/dialog.tsx`. Title "Tus supuestos", the text "Todas las ganancias, cuotas y efectivo se calculan con estos números. Cambia uno y toda la app se recalcula.", and these inputs:
- range inputs: TEA 4–14 % (step 0.1), TCEA 4–16 % (step 0.1), Cuota inicial 0–50 % (step 1), Plazo 5–30 años (step 1)
- number inputs: Efectivo disponible (empty means use the inicial %) and Amortización extra (soles per month)

Next to a changed field: "Estándar: {default}". Buttons "Volver al estándar" and "Listo". On change (debounced 300 ms), it writes the cookie (`path=/`, one year) and calls `router.refresh()`. The `/departamentos` client stops writing assumption URL parameters and reads them from the cookie through the API.

- [ ] **Step 4: Run the smoke and the checks**

Run: `pnpm smoke:ui http://localhost:3100 /tmp/dptos-smoke`
Expected: still FAIL only on "Recomendados" (Task 4 adds it).
Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS. In the screenshots: dark charcoal surfaces, emerald accents, the pill.

- [ ] **Step 5: Commit**

```bash
git add app components scripts package.json
git commit -m "feat: dark theme tokens, new navigation, and the assumptions window"
```

### Task 3: Inicio numbers and recommendations

**Files:**
- Create: `lib/home.ts`, `lib/home.test.ts`

**Interfaces:**
- Consumes: `DepartamentosRow` from `lib/departamentos-query.ts`.
- Produces:
  - `type HomeKpis = { typicalSalePen: number | null; typicalRentPen: number | null; grossYieldPct: number | null; saleCount: number }`
  - `homeKpis(sales: Pick<DepartamentosRow, 'pricePen' | 'grossRentPen'>[], rentPrices: number[]): HomeKpis`. Typical sale = median `pricePen`. Typical rent = median of `rentPrices`. Gross yield = median of `grossRentPen × 12 / pricePen × 100` over rows with a rent, one decimal. `saleCount` = rows.
  - `type RecoMode = 'gain' | 'yield' | 'below' | 'location' | 'new'`
  - `RECO_TABS: { mode: RecoMode; label: string }[]` with labels "Mejor ganancia", "Más rentables", "Bajo precio de mercado", "Mejor ubicación", "Nuevos".
  - `recommend(rows: DepartamentosRow[], mode: RecoMode, n: number): { rows: DepartamentosRow[]; hasMore: boolean }`. Sort keys: `monthlyGainPen` desc, gross yield desc, `discountPct` desc, `locationScore` desc, `daysPublished` asc. A row with no value for the key goes last. Ties break by `postingId`.
  - `moneyLine(gainPen: number | null): { text: string; tone: 'gain' | 'loss' } | null`

- [ ] **Step 1: Write the failing tests in `lib/home.test.ts`**

```ts
test('homeKpis takes medians and skips rows with no rent for the yield', () => {
  const k = homeKpis([{ pricePen: 300000, grossRentPen: 1500 }, { pricePen: 400000, grossRentPen: null }, { pricePen: 500000, grossRentPen: 2500 }], [2000, 2500, 3000]);
  assert.deepEqual(k, { typicalSalePen: 400000, typicalRentPen: 2500, grossYieldPct: 6, saleCount: 3 });
});

test('homeKpis with no data gives nulls and zero', () => {
  assert.deepEqual(homeKpis([], []), { typicalSalePen: null, typicalRentPen: null, grossYieldPct: null, saleCount: 0 });
});

test('recommend puts rows without the sort value last, in every mode', () => {
  // rows: a (gain 200, score 7), b (gain null, score null), c (gain 50, score 9)
  assert.deepEqual(recommend(rows, 'gain', 3).rows.map((r) => r.postingId), ['a', 'c', 'b']);
  assert.deepEqual(recommend(rows, 'location', 3).rows.map((r) => r.postingId), ['c', 'a', 'b']);
});

test('recommend reports whether more rows exist', () => {
  assert.equal(recommend(rows, 'gain', 2).hasMore, true);
  assert.equal(recommend(rows, 'gain', 3).hasMore, false);
  assert.equal(recommend(rows, 'gain', 16).rows.length, 3);
});

test('moneyLine', () => {
  assert.deepEqual(moneyLine(1234), { text: 'Ganas S/ 1,234/mes', tone: 'gain' });
  assert.deepEqual(moneyLine(0), { text: 'Ganas S/ 0/mes', tone: 'gain' });
  assert.deepEqual(moneyLine(-80), { text: 'Pones S/ 80/mes', tone: 'loss' });
  assert.equal(moneyLine(null), null);
});
```

Build `rows` with a small factory that fills the other `DepartamentosRow` fields with neutral values.

- [ ] **Step 2: Run them to see them fail**

Run: `node --import tsx --test lib/home.test.ts`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement `lib/home.ts`**

- [ ] **Step 4: Run the tests**

Run: `node --import tsx --test lib/home.test.ts && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/home.ts lib/home.test.ts
git commit -m "feat: Inicio market numbers and recommendation lists"
```

### Task 4: The Inicio page

**Files:**
- Modify: `app/page.tsx` (replace the redirect)
- Create: `app/inicio/kpi-strip.tsx`, `app/inicio/continue-card.tsx`, `app/inicio/recommendations.tsx` (client), `components/listing-card.tsx`, `components/score-badge.tsx`
- Optional: `lib/market.ts` can gain a light helper that returns live rent prices

**Interfaces:**
- Consumes:
  - Task 1 (the cookie) and Task 3 (`homeKpis`, `recommend`, `RECO_TABS`, `moneyLine`)
  - `getCachedSaleListings` and `queryDepartamentos`
  - `loadRentObservations`, or its live-rent filter, for the rent prices
  - `FavoritesProvider` for the add button
- Produces: `ListingCard({ row })` and `ScoreBadge({ score, reasons })`, which step 2 reuses.

- [ ] **Step 1: Server page**

`app/page.tsx` reads the cookie and loads the universe. It runs `queryDepartamentos` over all tracked districts with the cookie's panel and `pageSize: 100000`, and computes `homeKpis`. The client gets only the row fields that the cards and the table need.

- [ ] **Step 2: KPI strip**

Four cards with a label, a value, and a caption, exact:
- "Precio de venta típico" · "Mediana de los avisos en venta de los distritos que sigue dptos"
- "Alquiler mensual típico" · "Mediana de los avisos de alquiler de los mismos distritos"
- "Rentabilidad bruta" · "Alquiler de un año dividido entre el precio de venta"
- "Avisos en venta" · "Vistos en las últimas corridas"

A null value shows a dash ("-").

- [ ] **Step 3: Continuar**

Until step 2 adds inversiones, the favorites stand in for them. The card reads "Continuar", the title "Favoritos", "{n} elegidos", up to 5 round thumbnails, and "Abrir" to `/favoritos`. Beside it, "Otras inversiones" shows the text "Podrás crear varias inversiones en el siguiente paso." and a disabled "+ Nueva inversión" button.

- [ ] **Step 4: Recomendados and the listing card**

- Tabs from `RECO_TABS`. 16 rows at first, and "Ver más" adds 8 while `hasMore`.
- A view switch (cards or table) and, in card view, column buttons 2 to 6, default 4. Both are remembered in `localStorage` (wrapped in try/catch) under `dptos.inicio.view` and `dptos.inicio.cols`. On a phone, card view is always one column.
- `ListingCard`: the photo from `imageUrl`, `ScoreBadge` in the top right, and an add button in the top left. If `imageUrl` is null, the card shows a neutral gradient. The add button shows on hover and always on touch screens, and toggles the favorite for now. Below: price, "{beds} dorm · {area} m² · {district}", and the `moneyLine`. Clicking the card opens the listing `url` in a new tab.
- `ScoreBadge`: a violet badge with a map-pin icon and the score with one decimal. Its tooltip has three parts:
  - the title "Ubicación {x} de 10"
  - the text "Mitad calidad de la zona (tus zonas y lugares a menos de 500 m) y mitad demanda de inquilinos (alquileres cerca, ingresos y pobreza del distrito). 10 es el mejor lugar entre los departamentos que sigue dptos."
  - the listing's reasons, as a list

  If the score is null, the card shows no badge.
- Table view columns: photo, Departamento (district, beds, m²), Precio, Alquiler est., Ganancia, Rentabilidad, Efectivo día 1, Ubicación, and the add button.

- [ ] **Step 5: Smoke and checks**

Run, with the seed dev server: `pnpm smoke:ui http://localhost:3100 /tmp/dptos-smoke`
Expected: PASS at both sizes. In the screenshots: the strip, Continuar, 16 photo cards in 4 columns, and violet badges in the top right corner of the photos.
Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app components lib
git commit -m "feat: Inicio page with market numbers, Continuar, and recommendations"
```
