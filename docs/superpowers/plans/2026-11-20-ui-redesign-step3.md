# UI Redesign Step 3: Mercado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/mercado`, one dashboard page that explains prices, rents, projects, people, sources, studies, voices, and news in Lima.

**Architecture:** Pure functions in `lib/` turn the cached listings, rent observations, statistics, and district boundaries into the numbers each section shows. Editable files in `data/market/` hold studies, voices, feeds, and news keywords. A `NewsItem` table holds headlines, and `pnpm news:fetch` fills it. The page is a server page with client islands for charts, the map, and the save buttons.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Prisma 7, `recharts` (installed), `react-map-gl/maplibre` (installed), `fast-xml-parser` (new), node:test with tsx, Playwright smoke.

**Spec:** `docs/superpowers/specs/2026-11-20-ui-redesign-design.md`, section "Mercado (one dashboard page)". Step 2 shipped in PR #6.

## Global Constraints

- Screen text is Spanish. Dark mode only, with the theme tokens in `app/globals.css`. Violet (`--score`) only for the location score. Icons from `lucide-react`.
- Indicators are monthly or plain amounts. Per-m² values appear only where they compare different sizes.
- Every number that is not obvious has a short explanation on hover, with its source and period.
- Official or named sources only. Each statistic shows its source and year.
- Studies that report asking prices say so: "Son precios de aviso, no de venta."
- A voice whose author sells advice carries the tag "vende asesoría". Only voices with `revisado` set to `si` appear on the page. The owner reviews the list.
- News: store and show only the headline, the source, the date, and the link. Never store or show article text. Fetch with a generic User-Agent: `Mozilla/5.0 (compatible; dptos-news/1.0)`.
- Map tiles: OpenFreeMap only, style `https://tiles.openfreemap.org/styles/dark`, as in step 2.
- Speed: `/mercado` loads in under 2 seconds on the owner's machine after the listings memo is warm.
- Never touch the database `dptos` during the build. Use `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed`, with the dev server on port 3100. Migrations run as `arturoLucazzz`.
- Test command: `pnpm test`. Typecheck: `pnpm typecheck`. Lint: `pnpm lint`. Smoke: `pnpm smoke:ui http://localhost:3100 /tmp/dptos-smoke`.

## Builder calls in this plan

- "Change from the previous week" in Nuestras fuentes is shown as two counts per portal. "Nuevos en 7 días" counts listings first seen in the last 7 days. "Salieron en 7 días" counts listings that crossed the possibly-sold cutoff in the last 7 days, with the rule that `loadPriceIndex` uses. A single net number hides both movements.
- "How many listings repeat across portals" counts live properties with copies on 2 or more sources.
- The price histogram uses bins of S/ 100,000 from S/ 0 to S/ 2,000,000, plus one bin "S/ 2 M o más".
- The district map shows the Ipsos zone income on every district of its zone, with the zone name in the tooltip.
- The nav link "Mercado" moves to `/mercado`. `/estadisticas` stays until step 4.

## Review Focus

1. A district with listings but no rent observations, or no statistic: its chart bar or map color shows "sin datos", never 0. Test in Task 1 and Task 2.
2. A feed that fails, times out, or returns bad XML: `news:fetch` reports it and keeps the other feeds. Test in Task 4.
3. The same headline in two feeds, or fetched twice: it is stored once (unique URL). Test in Task 4.
4. A voice or study row with a bad URL or a missing field: the loader rejects the file with a Spanish error that names the row. Test in Task 3.
5. An empty `NewsItem` table (news never fetched): the section reads "Todavía no hay noticias. Corre pnpm news:fetch." Test in Task 7.

---

### Task 1: Market numbers by district

**Files:**
- Create: `lib/market-dashboard.ts`, `lib/market-dashboard.test.ts`

**Interfaces:**
- Consumes: `getCachedSaleListings()` (lib/listings.ts), `loadRentObservations()` (lib/market.ts), `loadConstructionPipeline()` (lib/analytics.ts), `homeKpis` (lib/home.ts), `grossYieldPct` (lib/gross-yield.ts), `loadProjectRows()` (lib/project-rows.ts).
- Produces:
  - `DistrictMarket` = `{ slug: string; name: string; typicalSalePen: number | null; typicalRentPen: number | null; grossYieldPct: number | null; saleCount: number; rentCount: number }`
  - `districtMarket(sales: { districtSlug: string; districtName: string; pricePen: number; grossRentPen: number | null }[], rents: { districtSlug: string; pricePen: number }[]): DistrictMarket[]`, sorted by `saleCount` descending. Medians. The yield is the median of the per-listing gross yields, rounded to 1 decimal.
  - `topYieldSlugs(rows: DistrictMarket[], n = 3): string[]`: highest `grossYieldPct`, nulls never chosen, only districts with `saleCount >= 20`.
  - `priceHistogram(prices: number[]): { label: string; from: number; to: number | null; count: number }[]`, with the bins in the builder calls. Labels like "S/ 300–400 mil" and "S/ 2 M o más".
  - `SourceStats` = `{ source: SourceId; label: string; liveCount: number; typicalSalePen: number | null; newLast7: number; goneLast7: number }` and `sourceStats(...)` (pure part), plus `repeatedAcrossPortals(rows): number`.
  - `MarketDashboard` = `{ kpis: HomeKpis & { projectCount: number }; districts: DistrictMarket[]; topYield: string[]; histogram: ReturnType<typeof priceHistogram>; construction: ConstructionPipeline[]; sources: SourceStats[]; repeated: number }`
  - `loadMarketDashboard(): Promise<MarketDashboard>`, memoized next to the listings memo with the same key and invalidation.

- [ ] **Step 1: Failing tests.**
  - `districtMarket` with two districts: medians per district, `rentCount` counted, a district with no rent gets `typicalRentPen: null` and `grossYieldPct: null`.
  - `topYieldSlugs` skips nulls and districts with fewer than 20 sales.
  - `priceHistogram([50_000, 350_000, 399_999, 2_500_000])` puts one price in "S/ 0–100 mil", two in "S/ 300–400 mil", and one in "S/ 2 M o más".
  - `repeatedAcrossPortals` counts a row with copies from 2 sources once, and a row with 2 copies from one source not at all.
- [ ] **Step 2: Implement.** Run the focused tests. Expected: PASS.
- [ ] **Step 3:** Run `pnpm test && pnpm typecheck && pnpm lint`, then commit `feat: market numbers by district, price histogram, and source stats`.

### Task 2: District map data

**Files:**
- Create: `lib/district-map.ts`, `lib/district-map.test.ts`

**Interfaces:**
- Consumes: `DistrictStat.boundary` (43 districts, rings of `[lon, lat]`), `readLatestStats(db)` (lib/stats/store.ts), `data/stats/places.csv` and `data/stats/indicators.csv` through the existing stats file readers.
- Produces:
  - `MAP_METRICS`, in this order, with exact labels: `zone_household_income_pen` "Ingreso del hogar (zona Ipsos)", `high_income_pct` "Vecinos de ingreso alto", `poverty_pct` "Pobreza", `complaints_per_10k` "Denuncias por 10 mil habitantes". Each carries its unit, source, and period from the indicator catalog and the statistic rows.
  - `buildDistrictFeatures(boundaries, latest, places, trackedSlugs): GeoJSON.FeatureCollection`. Each feature has `slug`, `name`, `tracked` (boolean), one property per metric (number or null), and `zone` (the Ipsos zone label or null).
  - `metricScale(values: (number | null)[], steps = 5): number[]`: quantile breaks that ignore nulls.
  - `nseLima(latest): { level: 'A' | 'B' | 'C' | 'D' | 'E'; pct: number }[]` from the `lima-metropolitana` place.

- [ ] **Step 1: Failing tests.**
  - A district in an Ipsos zone gets that zone's income and `zone` label. A district outside every zone gets `null` for both.
  - A district with no statistic gets `null`, never 0.
  - `tracked` is true only for the given slugs.
  - `metricScale` ignores nulls and returns increasing breaks.
  - `nseLima` returns the five levels in order A to E.
- [ ] **Step 2: Implement.** Run the focused tests. Expected: PASS.
- [ ] **Step 3:** Run the checks, then commit `feat: district map features with statistics and Ipsos zones`.

### Task 3: Market files

**Files:**
- Create: `data/market/estudios.csv`, `data/market/voces.csv`, `data/market/feeds.csv`, `data/market/news-keywords.csv`, `data/market/README.md`
- Create: `lib/market-files.ts`, `lib/market-files.test.ts`

**Interfaces:**
- Consumes: `csvLines` and `splitCsvLine` from `lib/stats/csv.ts`.
- Produces:
  - `estudios.csv` header `titulo,autor,url,frecuencia,precios_de_aviso,nota`. `precios_de_aviso` is `si` or `no`.
  - `voces.csv` header `nombre,plataforma,url,tema,vende_asesoria,revisado`. The two flags are `si` or `no`.
  - `feeds.csv` header `nombre,url,prioridad`. `prioridad` is a whole number, and 1 comes first.
  - `news-keywords.csv` header `palabra`, one keyword per row, lowercase, accents allowed.
  - `loadEstudios()`, `loadVoces({ onlyReviewed: boolean })`, `loadFeeds()`, `loadNewsKeywords()`. Each throws a Spanish error that names the file and the row: wrong header, wrong cell count, a URL that is not `https://`, a flag that is not `si` or `no`, an empty required field.

- [ ] **Step 1: Failing tests** with in-memory text for each rule above, and a test that the committed files parse.
- [ ] **Step 2: Fill the files.**
  - Estudios: the Urbania "Índice del Mercado Inmobiliario" and the Adondevivir blog reports. Also the CODIP report on Nexo data, the BCRP "Notas de estudios" on housing prices, and the ASEI and CAPECO market reports. Each URL must answer 200 with curl and the generic User-Agent. Leave out any that does not.
  - Feeds, in this order: Gestión `https://gestion.pe/arc/outboundfeeds/rss/?outputType=xml`, El Comercio `https://elcomercio.pe/arc/outboundfeeds/rss/?outputType=xml`, Andina `https://andina.pe/agencia/rss/3.xml`.
  - Keywords: inmobiliari, vivienda, departamento, hipotecari, alquiler, mivivienda, tasa de interés, bcrp, construcción, capeco, asei, urbania, techo propio.
  - Voces: candidate creators found with web search, all with `revisado` set to `no`. If a profile URL does not answer, leave the profile out. If the profile offers paid advice, courses, or properties for sale, set `vende_asesoria` to `si`.
  - `README.md`: what each file holds, the column rules, and that the owner sets `revisado` to `si` to publish a voice.
- [ ] **Step 3:** Run the checks, then commit `feat: market files for studies, voices, feeds, and news keywords`.

### Task 4: News storage and fetch

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_news_items/migration.sql`
- Create: `lib/news/parse.ts`, `lib/news/parse.test.ts`, `lib/news/fixtures/*.xml`, `scripts/news-fetch.ts`
- Modify: `package.json` (script `news:fetch`, dependency `fast-xml-parser`)

**Interfaces:**
- Produces:
  - `NewsItem`: `id`, `url` (unique), `title`, `source`, `publishedAt` (DateTime, nullable), `fetchedAt`, `saved` (Boolean, default false), `savedAt` (nullable). Index on `publishedAt`.
  - `parseFeed(xml: string, source: string): { url: string; title: string; publishedAt: Date | null }[]` for RSS 2.0 and Atom. It strips HTML from titles, decodes entities, and drops items with no link or no title.
  - `matchesKeywords(title: string, keywords: string[]): boolean`: case and accent insensitive.
  - `fetchNews(deps: { feeds; keywords; fetch; db; now }): Promise<{ source: string; ok: boolean; found: number; kept: number; inserted: number; error?: string }[]>`. A 10 second timeout per feed. A failed feed gives `ok: false` and the others continue. Inserts use the unique URL, so repeats are skipped.
  - `pnpm news:fetch` prints one line per feed. If every feed failed, it exits with code 1.

- [ ] **Step 1: Failing tests** with fixture files:
  - an RSS 2.0 feed (Gestión shape) and an Atom feed (Andina shape)
  - bad XML, which throws a parse error that `fetchNews` turns into `ok: false`
  - HTML in a title
  - a duplicate URL across two feeds, stored once (with a fake db)
  - the keyword match with accents ("Hipotecario", "construcción")
- [ ] **Step 2: Implement and migrate the seed** with `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed pnpm prisma migrate dev --name news_items`.
- [ ] **Step 3:** Run `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed pnpm news:fetch` once. Report the per-feed lines.
- [ ] **Step 4:** Run the checks, then commit `feat: news items from RSS feeds with a keyword filter`.

### Task 5: The Mercado page, numbers and charts

**Files:**
- Create: `app/mercado/page.tsx`, `app/mercado/market-charts.tsx` (client), `app/mercado/sources-table.tsx`
- Modify: `components/top-bar.tsx` ("Mercado" to `/mercado`), `scripts/smoke-ui.mjs`

**Interfaces:**
- Consumes: `loadMarketDashboard()` (Task 1), the KPI strip pattern from `app/inicio/kpi-strip.tsx`.

- [ ] **Step 1: Sections**, each with a title and a one-line explanation:
  1. Market numbers: "Precio de venta típico", "Alquiler mensual típico", "Rentabilidad bruta", "Avisos en venta", "Proyectos". Reuse the Inicio captions, and add the caption "Proyectos con avisos vigentes" for the fifth.
  2. "Alquiler mensual vs precio de venta": bars for the typical sale price and a line for the typical monthly rent, one pair per district with 20 or more sales, two axes. The tooltip shows both values, the counts, and "sin datos" for nulls.
  3. "Rentabilidad bruta por distrito": horizontal bars, the top three from `topYieldSlugs` in the gain color, the rest muted.
  4. "Dónde se construye": stacked bars per district (en planos, en construcción, entrega inmediata).
  5. "Cuántos avisos por precio": the histogram.
  6. "Nuestras fuentes": a table with one row per portal (Urbania, Adondevivir, Proper, Nexo). The columns are avisos vigentes, precio típico, nuevos en 7 días, and salieron en 7 días. One line under it reads "{n} departamentos aparecen en 2 o más portales."
- [ ] **Step 2: Layout.** On a desktop, charts sit two per row. On a phone, one per row, and the table scrolls inside its card. Chart colors come from the theme tokens. Read the dataviz skill before you write chart code.
- [ ] **Step 3: Smoke.** Add `/mercado` to the smoke with the texts "Alquiler mensual vs precio de venta" and "Nuestras fuentes". Run it. Expected: PASS at both sizes.
- [ ] **Step 4:** Run the checks, then commit `feat: Mercado page with market numbers, district charts, and our sources`.

### Task 6: The district map and NSE

**Files:**
- Create: `app/mercado/district-map.tsx` (client, `next/dynamic` with `ssr: false`), `app/mercado/nse-bars.tsx`
- Modify: `app/mercado/page.tsx`

**Interfaces:**
- Consumes: `buildDistrictFeatures`, `MAP_METRICS`, `metricScale`, `nseLima` (Task 2). Reuse the maplibre worker setup from `app/inversiones/[id]/workspace-map.tsx`. If both maps need it, move it to a shared module.

- [ ] **Step 1: "Cómo se reparte Lima".**
  - A map of the 43 districts colored by the chosen metric. A switch above it has the four `MAP_METRICS` labels.
  - Tracked districts (with listings) have a white outline.
  - The hover tooltip shows the district, the value with its unit, the zone for the Ipsos metric, and the source and year. A null value reads "sin datos" in a gray fill.
  - A legend shows the quantile breaks.
- [ ] **Step 2: NSE.** Next to the map, show bars for NSE A to E of Lima Metropolitana with the source (APEIM 2025). Add the note "Ninguna fuente gratuita publica el NSE por distrito.".
- [ ] **Step 3:** Look at the desktop and phone screenshots for the colored map. Run the checks, then commit `feat: Mercado district map with income, poverty, and complaints, plus NSE`.

### Task 7: Studies, voices, and news on the page

**Files:**
- Create: `app/mercado/estudios.tsx`, `app/mercado/voces.tsx`, `app/mercado/noticias.tsx` (client for the save buttons), `app/mercado/actions.ts`
- Modify: `app/mercado/page.tsx`, `scripts/smoke-ui.mjs`

**Interfaces:**
- Consumes: `loadEstudios`, `loadVoces({ onlyReviewed: true })` (Task 3), `NewsItem` (Task 4).
- Produces: `toggleSavedNews(id: string): Promise<{ saved: boolean }>` (a server action with no `revalidatePath` of `/mercado`). The client updates itself and rolls back on error with "No se pudo guardar.".

- [ ] **Step 1: "Estudios".** Cards with the title, the author, the frequency, the note, and a link that opens in a new tab. If `precios_de_aviso` is `si`, the card shows "Son precios de aviso, no de venta.".
- [ ] **Step 2: "Voces del mercado".** Cards with the name, the platform, the topic, and the link. If `vende_asesoria` is `si`, the card shows the tag "vende asesoría". With no reviewed voice, the section reads "Todavía no hay voces revisadas.".
- [ ] **Step 3: "Noticias".** The 20 newest headlines with the source and the date, each with a link that opens in a new tab and a save button. A tab "Guardadas" lists the saved ones. Gestión items come first within the same day. With no rows, the section reads "Todavía no hay noticias. Corre pnpm news:fetch.".
- [ ] **Step 4: Smoke and checks.** Add "Estudios", "Voces del mercado", and "Noticias" to the `/mercado` smoke texts. Run the smoke and `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Commit `feat: Mercado studies, voices, and news with saved headlines`.
