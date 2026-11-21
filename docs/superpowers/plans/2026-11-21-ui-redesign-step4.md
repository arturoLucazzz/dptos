# UI Redesign Step 4: Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the pages that the new interface replaced, add a settings page whose first section is the duplicate review, and make the news filter precise and daily.

**Architecture:** A new owner page, `/configuracion`, holds settings sections. Its first section, `/configuracion/duplicados`, takes the duplicate review from the `/departamentos` table. The old pages and the code that only they use are deleted. The drawn-zone action that Mis inversiones uses moves next to the workspace. The daily scrape wrapper also runs `pnpm news:fetch`.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Prisma 7, node:test with tsx, Playwright smoke, bash.

**Spec:** `docs/superpowers/specs/2026-11-20-ui-redesign-design.md`, sections "Builder calls" (old pages) and "Steps" (4. Cleanup). Step 3 shipped in PR #7, and the market files in PR #8.

## Global Constraints

- Screen text is Spanish. Dark mode only, with the theme tokens in `app/globals.css`. Icons from `lucide-react`.
- The owner decided the scope on 2026-11-21: keep the duplicate review, inside a settings page that later holds other settings, and remove the rest with no replacement. That covers `/departamentos`, `/favoritos`, `/zonas`, `/estadisticas`, `/alertas`, and `/agregar`. The alerts, the zone list, the price evolution chart, and manual entry are not moved anywhere.
- Old URLs get no redirects. A bookmarked old URL shows the Next.js "not found" page.
- `/runs` stays as an owner page. The "Más" menu lists only "Configuración" and "Corridas".
- Never touch the database `dptos` during the build. Use `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed`, with the dev server on port 3100.
- No database migration in this step. The `Property.favorite` and `Property.notes` columns stay in the schema, unused, as the spec says.
- Test command: `pnpm test`. Typecheck: `pnpm typecheck`. Lint: `pnpm lint`. Smoke: `pnpm smoke:ui http://localhost:3100 /tmp/dptos-smoke`.

## Builder calls in this plan

- `/agregar` is removed with the others, because the owner said to remove everything except the duplicates. `lib/manual-listing.ts` goes with it. Existing `manual` postings stay in the database, and the duplicate review can still mark a manual copy as removed.
- The new news keywords replace the broad words "vivienda", "departamento", "construcción", and "bcrp" with phrases. The list is in Task 1.
- `news:fetch` runs before the scrape in the daily and weekly wrapper modes, so that a failed scrape does not skip the news. A failed `news:fetch` never stops the scrape.

## Review Focus

1. A bookmarked old URL, such as `/departamentos?tea=7` or `/zonas`: the "not found" page, with no server error. Test in Task 3 (smoke).
2. Drawing and saving a zone in a workspace after the action moves: it still saves and recomputes the location scores. Test in Task 3.
3. A duplicate decision that fails, for example a candidate that another tab already decided: the row stays and shows the Spanish error. Test in Task 2.
4. `news:fetch` fails, or every feed fails: the scrape still runs. Test in Task 1.
5. The listings memo after the favorite patch is gone: `invalidateSaleListings()` still clears the listings, project, and market dashboard memos. Test in Task 4.

---

### Task 1: Precise news keywords and daily news

**Files:**
- Modify: `data/market/news-keywords.csv`, `data/market/README.md`
- Modify: `scripts/scrape-wrapper.sh`
- Test: `lib/market-files.test.ts`

**Interfaces:**
- Consumes: `loadNewsKeywords()` (lib/market-files.ts), `matchesKeywords(title, keywords)` (lib/news/parse.ts).

- [ ] **Step 1: Failing test** `committed keywords keep market headlines and drop off-topic ones`. With `loadNewsKeywords()`:
  - false for "Ministerio de Vivienda culmina construcción de cámaras de bombeo para prevenir aniegos"
  - false for "Temblor en Junín: reportan daños en viviendas, caída de rocas y corte de energía"
  - false for "BCRP emite moneda sobre bicentenario del Colegio Nacional de San Carlos de Puno"
  - false for "Elecciones en el departamento de Cusco"
  - true for "Créditos hipotecarios crecen 8% en octubre"
  - true for "Precio de vivienda en Lima sube en el tercer trimestre"
  - true for "Mercado inmobiliario: ventas de departamentos caen en Lima"
  - true for "BCRP mantiene la tasa de referencia en 4.25%"
- [ ] **Step 2:** Run `pnpm exec tsx --test lib/market-files.test.ts`. Expected: FAIL on the false cases.
- [ ] **Step 3:** Replace the keywords with exactly these rows, in this order:
  - `inmobiliari`
  - `hipotecari`
  - `mivivienda`
  - `techo propio`
  - `precio de vivienda`
  - `precios de vivienda`
  - `venta de vivienda`
  - `venta de departamentos`
  - `vivienda nueva`
  - `alquiler de departamento`
  - `alquiler de vivienda`
  - `precio del alquiler`
  - `sector construcción`
  - `tasa de interés`
  - `tasa de referencia`
  - `capeco`
  - `asei`
  - `urbania`
  - `adondevivir`
  - `nexo inmobiliario`
  In the README, say that a keyword matches any part of a headline. So each keyword must be a phrase that only appears in market news.
- [ ] **Step 4:** Run the focused test. Expected: PASS.
- [ ] **Step 5:** Change `scripts/scrape-wrapper.sh`:
  - In the `daily` and `weekly` modes, run `pnpm news:fetch` before `caffeinate -i pnpm scrape`. It runs after the kill switch and the git pull.
  - Write it as `pnpm news:fetch || echo "news:fetch failed; continuing with the scrape"`. Under `set -e`, a failure then never stops the scrape.
  - Leave `manual` mode unchanged.
- [ ] **Step 6:** Run `bash -n scripts/scrape-wrapper.sh`. Expected: no output. Then check the failure path without the network and without a scrape: run the wrapper's news line alone with `pnpm` replaced by `false`, and show that the echo prints and the exit code is 0. Paste the command and output in the report.
- [ ] **Step 7:** Run `pnpm test && pnpm typecheck && pnpm lint`, then commit `feat: precise news keywords and news:fetch in the daily and weekly runs`.

### Task 2: The settings page with the duplicate review

**Files:**
- Create: `app/configuracion/page.tsx`, `app/configuracion/layout.tsx`, `app/configuracion/sections.ts`, `app/configuracion/duplicados/page.tsx`, `app/configuracion/duplicados/duplicate-review.tsx` (client), `app/configuracion/duplicados/actions.ts`
- Create: `lib/duplicate-queue.ts`, `lib/duplicate-queue.test.ts`
- Modify: `components/top-bar.tsx`, `scripts/smoke-ui.mjs`

**Interfaces:**
- Consumes: `getCachedSaleListings()` rows with `copies` and `duplicateFlags` (lib/listings.ts), `confirmDuplicate`, `rejectDuplicate`, `splitPosting`, `DuplicateReviewError` (lib/duplicates.ts). The review cell, `DUPLICATE_BADGES`, and the four actions in `app/actions.ts` and `app/departamentos/departamentos-table.tsx` are the code to move. Task 4 deletes the originals.
- Produces:
  - `duplicateQueue<T extends { duplicateFlags: unknown[]; copies: unknown[] }>(rows: T[]): T[]`: rows with at least one duplicate flag first, then rows with 2 or more copies and no flag. Keep the input order inside each group.
  - `SETTINGS_SECTIONS` in `app/configuracion/sections.ts`: an array of `{ href: string; label: string; description: string }`. Today it has one entry: `{ href: "/configuracion/duplicados", label: "Duplicados", description: "Avisos que pueden ser la misma propiedad en dos portales." }`. A new setting later adds one entry and one route.
  - `app/configuracion/duplicados/actions.ts`: `confirmDuplicate(candidateId)`, `rejectDuplicate(candidateId)`, `splitPosting(postingId)`, each returning `ReviewResult = { ok: true } | { ok: false; error: string }`, and `markManualRemoved(postingId): Promise<void>`. Each one calls `invalidateSaleListings()` and `revalidatePath('/configuracion/duplicados')`.

- [ ] **Step 1: Failing tests** for `duplicateQueue`: flagged rows come first, multi-copy rows follow, rows with one copy and no flag are dropped, and the order inside each group is kept.
- [ ] **Step 2:** Run them. Expected: FAIL. Implement `duplicateQueue`. Expected: PASS.
- [ ] **Step 3:** Move the four actions into `app/configuracion/duplicados/actions.ts` with the same behavior and Spanish errors. Move the review cell into `duplicate-review.tsx`. If an action returns `ok: false`, the row stays and shows the error under it. Leave the originals in place for Task 4.
- [ ] **Step 4:** Build the settings shell:
  - `app/configuracion/layout.tsx`: the title "Configuración" and a side menu built from `SETTINGS_SECTIONS`, with the current section marked. On a phone, the menu is a row of links above the content.
  - `app/configuracion/page.tsx`: one card per section, with its label, description, and link.
- [ ] **Step 5:** Build `/configuracion/duplicados`:
  - The heading "Duplicados". The one-line explanation reads "Avisos que pueden ser la misma propiedad en dos portales. Decide si son la misma, o sepáralos."
  - One card per row in `duplicateQueue` order. Show the district, the price range, the copies with their source and link, and the review controls.
  - With no rows, the page reads "No hay duplicados por revisar."
- [ ] **Step 6:** In `components/top-bar.tsx`, set "Más" to exactly `{ href: "/configuracion", label: "Configuración" }` and `{ href: "/runs", label: "Corridas" }`.
- [ ] **Step 7:** Add `/configuracion` to the smoke with the texts "Configuración" and "Duplicados", and `/configuracion/duplicados` with the text "Duplicados". Run the smoke. Expected: PASS at both sizes. In a browser on port 3100, confirm one flag and split one copy on the seed. Paste what changed. Then undo both with the same page, so the seed ends as it began.
- [ ] **Step 8:** Run the checks, then commit `feat: settings page with the duplicate review`.

### Task 3: Remove the old pages

**Files:**
- Delete: `app/departamentos/`, `app/api/departamentos/`, `app/favoritos/`, `app/zonas/`, `app/estadisticas/`, `app/alertas/`, `app/agregar/`
- Create: `app/inversiones/zone-actions.ts` (moved `saveDrawnZone`), `app/inversiones/recompute.ts` (moved `recomputeLocationScores` and `RECOMPUTE_FAILED`)
- Modify: `app/inversiones/[id]/workspace.tsx`, `scripts/smoke-ui.mjs`

**Interfaces:**
- Consumes: `saveDrawnZone(input: { name: string; rating: number; notes: string; ring: Ring }): Promise<DrawnZoneResult>` (now in app/zonas/actions.ts), `recomputeLocationScores(): Promise<string | null>` (app/zonas/recompute.ts).
- Produces: the same two functions at their new paths, with the same behavior. `saveZone` and `deleteZone` are not moved.

- [ ] **Step 1:** Move `saveDrawnZone` and its helpers into `app/inversiones/zone-actions.ts`, and `recompute.ts` into `app/inversiones/`. Point `workspace.tsx` at the new path. If a test covers either function, move it too, and run it. Expected: PASS.
- [ ] **Step 2:** Delete the seven folders. Remove every link to a deleted path. Also remove every `revalidatePath` of a deleted path, for example in `app/actions.ts`.
- [ ] **Step 3:** In the smoke, remove the two `/departamentos` pages. Add a check that each of these paths answers 404 with no page error:
  - `/departamentos`
  - `/departamentos?tea=7&inicial=20`
  - `/favoritos`
  - `/zonas`
  - `/estadisticas`
  - `/alertas`
  - `/agregar`
- [ ] **Step 4:** Run the smoke. Expected: PASS. In a browser on port 3100, draw a zone in a workspace and save it. It must save with no error. Paste the result. Then delete that zone on the seed with one SQL statement on `dptos_seed` only, and paste the statement.
- [ ] **Step 5:** Run `pnpm test && pnpm typecheck && pnpm lint`, then commit `chore: remove the pages replaced by Inicio, Mis inversiones, and Mercado`.

### Task 4: Remove the code that only the old pages used

**Files:**
- Delete these files, and their tests:
  - `app/actions.ts`
  - `app/providers.tsx`
  - `app/lib/get-data.ts`
  - `app/lib/types.ts`
  - `components/assumptions-panel.tsx`
  - `components/ui/multi-select.tsx`
  - `components/ui/command.tsx`
  - `components/ui/checkbox.tsx`
  - `components/ui/select.tsx`
  - `components/ui/separator.tsx`
  - `lib/alerts.ts`
  - `lib/departamentos-search-params.ts`
  - `lib/departamentos-search-params.test.ts`
  - `lib/manual-listing.ts`
- Modify:
  - `lib/listings.ts`: remove `patchSaleListingFavorite`.
  - `lib/analytics.ts`: remove `loadPriceIndex`, `loadDistrictInventory`, `AnalyticsBundle`, and the helpers that only they use.
  - `lib/departamentos-query.ts`: remove the GET parser that only the deleted route used.

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports. `invalidateSaleListings()` keeps clearing the listings memo, `__projectRowsMemo`, and `__marketDashboardMemo`.

- [ ] **Step 1: Failing test** `invalidateSaleListings clears every derived memo` in `lib/listings.test.ts`. If that file is missing, create it. Set the three globalThis memo keys to a marker, call `invalidateSaleListings()`, and assert that each one is cleared. Run it. If it already passes, keep it as a guard and say so in the report.
- [ ] **Step 2:** Before you delete each file, grep for its importers. If every importer is gone, delete it. If a file in the Delete list still has a live importer, keep it and list it in the report.
- [ ] **Step 3:** Remove the listed exports. Then remove any export that no longer has an importer because of this task, together with its tests. Do not touch other dead code.
- [ ] **Step 4:** Find the npm dependencies that only a removed module used. Remove each one with `pnpm remove`. Look at `cmdk` and `@radix-ui/react-select` first.
- [ ] **Step 5:** Run `pnpm test && pnpm typecheck && pnpm lint` and the smoke. Expected: PASS. Commit `chore: remove code that only the old pages used`.
