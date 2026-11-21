# UI feedback round 1: design

Date: 2026-11-21. Owner feedback after the UI redesign (pieces 1 to 4, PRs #7 to #13).

## Intent

The owner uses dptos to find the apartments in Lima with the best return. Today Inicio has no filters, so the owner cannot narrow the list to a budget, a bedroom count, or a district. The district map shows one number per district, but a decision about a district needs more context: population, construction activity, prices, and income levels. A few details make the app feel unfinished. The top bar hides two pages in a "Más" menu, and buttons show no pointer cursor. The column selector takes too much space, and the "Corridas" page has light colors in a dark app.

## Goals

1. The top bar shows one link per page. The "Más" menu is removed.
2. Every enabled button shows the pointer cursor.
3. Each apartment shows its source portals as badges.
4. A small number field replaces the five column buttons on Inicio.
5. The district map has a panel with the district facts, and the income strata include income ranges.
6. Inicio has filters that are always visible, and the filters live in the URL.
7. The "Corridas" page uses the dark theme colors.

## Non-goals

- Automatic scraping schedules. The owner removed them in PR #13.
- A "Vista" menu or a picker for table columns. The owner rejected extra clicks.
- APEIM levels A to E per district. APEIM publishes them only for all of Lima (see `data/stats/apeim-nse-2025.md`).

## Anti-goals

- Filters that only filter the 16 cards already on the screen. The server filters the whole sale universe.
- Controls that need more clicks than today.
- Any English text on the screen.

## Approaches

Filters:
- A, chosen: the filters live in the URL search parameters, through the npm package `nuqs`. The server filters the full universe. The back button works, and a search can be saved or shared as a link.
- B, rejected: the filters live in React state only. They disappear on reload and cannot be shared.

The owner asked for an npm package for the URL state. `nuqs` 2.10.2 (released 2026-10-08) supports Next 16 and React 19.

District facts on the map:
- A, chosen: a fixed panel beside the map. It fills on hover with a mouse, and on tap on a touch screen. No click is needed with a mouse.
- B, rejected: the current floating popup with all the facts inside. It covers the neighbor districts and is cut off on small screens.

Income levels per district:
- Chosen by the owner: the 5 INEI income strata of 2020 per district (alto, medio alto, medio, medio bajo, bajo), each with its income range. The APEIM levels A to E stay as the all-Lima figure on Mercado.

## Design

### 1. Top bar

`components/top-bar.tsx` shows five links in this order: Inicio, Mis inversiones, Mercado, Configuración, Corridas. The `Popover` and the `moreLinks` list go. At phone width, the link row scrolls sideways (`overflow-x-auto`), so that the page itself never scrolls sideways.

### 2. Pointer cursor

Tailwind 4 removed the pointer cursor from buttons. One base rule in `app/globals.css` puts it back for every case:

```css
@layer base {
  button:not(:disabled), [role="button"]:not([aria-disabled="true"]), summary, label[for], select { cursor: pointer; }
  button:disabled, [aria-disabled="true"] { cursor: not-allowed; }
}
```

### 3. Source badges

- `HomeRow` gets `sources: { source: SourceId; url: string | null }[]`, one entry per portal, from the listing `copies`. The order is fixed: Urbania, Adondevivir, Proper, Nexo.
- A new `components/source-badges.tsx` shows one small badge per portal with the portal name. A badge with a URL is a link to that portal's listing, and it opens in a new tab.
- The badges show on `ListingCard`, which Inicio and the investment workspace both use, and in a new "Fuente" column of the Inicio table.

### 4. Columns on Inicio

- A number field with the label "Columnas" replaces the buttons 2 to 6: `<input type="number" min={2} max={6} step={1}>`, about 3.5 rem wide.
- The default is 4. The value is stored in `localStorage` under the existing key `dptos.inicio.cols`.
- A value out of range is clamped to 2 or 6. An empty field keeps the last valid value.
- The field shows only in the card view and only at `sm` width and wider. At phone width the grid has one column.
- The table columns stay fixed, with the new "Fuente" column.

### 5. District panel on the map

Layout: on `lg` screens and wider, the map and a panel of about 320 px sit side by side. Below `lg`, the panel sits under the map. Before any hover, the panel reads "Pasa el mouse sobre un distrito" (with a mouse) or "Toca un distrito" (on touch). The floating popup goes.

The metric switch that colors the map stays as it is.

Panel content, in this order. A missing value reads "sin datos".
1. District name, and the Ipsos zone name.
2. Población.
3. Proyectos activos: the live Nexo and Proper projects in the district, with the same "live" rule that the "Dónde se construye" chart uses.
4. For the 11 tracked districts only: avisos en venta, precio típico, alquiler típico, and rentabilidad bruta, from `districtMarket` in `lib/market-dashboard.ts`.
5. Ingreso promedio del hogar of the Ipsos zone.
6. Estratos de ingreso (INEI 2020): 5 bars from alto to bajo. Each bar shows the share of the district population and the income range of that stratum.
7. Pobreza monetaria, and denuncias por 10 mil habitantes.
8. A source line with the source and year of each figure.

New data:
- `data/stats/inei-estratos-2020.csv` gets 5 indicators per district: `stratum_alto_pct`, `stratum_medio_alto_pct`, `stratum_medio_pct`, `stratum_medio_bajo_pct`, `stratum_bajo_pct`. The values come from the district pages of the INEI document that the file already cites. `high_income_pct` stays, and it must equal `stratum_alto_pct`.
- A new `data/stats/inei-estratos-2020-rangos.csv` with the columns `stratum,min_pen,max_pen,unit,source,source_ref`. The unit is the monthly per-capita household income, as INEI defines the strata. `max_pen` is empty for the top stratum.
- The builder reads both from the PDF and records the page numbers. If a district page has no split, that district has no strata rows and its panel reads "sin datos" for strata.
- The 5 shares of a district must add up to between 99 and 101. A test checks this for every district in the file.

APEIM bars on Mercado: if the APEIM 2025 síntesis publishes an average monthly household income per level, each A to E bar shows it. If it does not, the bars stay as they are and the source note says that APEIM publishes no income per level.

### 6. Filters on Inicio

Filters, always visible in one row above the tabs:
- Precio (range, S/)
- Dormitorios (range)
- Distrito (several)
- Área (range, m²)
- Fuente (several)
- Ubicación (minimum score)

When any filter is on, a "Limpiar filtros" button shows.

The chips come from the workspace filters in `app/inversiones/[id]/filter-chips.tsx`. The builder moves the shared parts to `components/filters/`, and the workspace keeps its behavior.

URL parameters, in Spanish: `precio_min`, `precio_max`, `dorm_min`, `dorm_max`, `distrito` (comma list of slugs), `area_min`, `area_max`, `fuente` (comma list), `ubicacion_min`. The active tab also goes in the URL as `orden` (the `RecoMode`).

Data flow:
- One set of `nuqs` parsers in `lib/home-filters.ts`, shared by the client, `app/page.tsx`, and `app/api/inicio/recomendados/route.ts`.
- `app/page.tsx` reads the search parameters and renders the first page already filtered.
- A change on the client updates the URL with shallow routing, then fetches `/api/inicio/recomendados` with the same parameters.
- `loadHomeRows` passes the filters to `queryDepartamentos`. That function already filters by district, source, price, bedrooms, and location. The builder adds `areaMin` and `areaMax`.
- `NuqsAdapter` from `nuqs/adapters/next/app` wraps the app in `app/layout.tsx`.

Rules:
- The app ignores an invalid value in the URL. The result is the same as with no parameter. An unknown district slug is dropped.
- A min above the max swaps the two.
- No match reads "Ningún departamento cumple estos filtros." with the "Limpiar filtros" button.
- The KPI strip at the top of Inicio stays for the whole market (builder's call, see below).

### 7. Corridas colors

`app/runs/runs-client.tsx` uses theme colors in place of the fixed light colors:
- success: `bg-gain/15 text-gain`
- partial and warnings: a new `--warn` token in `app/globals.css` (amber, for example `#fbbf24`), used as `bg-warn/15 text-warn` and `border-warn/40`
- failed: `bg-loss/15 text-loss`

The builder also searches the whole app for fixed light classes and moves them to theme tokens. Examples are `bg-*-50`, `bg-*-100`, `bg-white`, and `text-black`.

## Delivery

Three pull requests, in this order:
1. Top bar, pointer cursor, the column field, and the Corridas colors (goals 1, 2, 4, 7).
2. Source badges and the Inicio filters (goals 3, 6).
3. The district panel and the strata data (goal 5).

The smoke test (`pnpm smoke:ui`) and an English-text scan run on each PR, as in earlier pieces.

## Builder's calls

These are calls I made, which the owner did not decide:
- The KPI strip on Inicio does not follow the filters. It describes the whole market.
- The tab (`orden`) goes in the URL with the filters.
- The Área filter is new in `queryDepartamentos`. The other filters already exist there.
- A source badge links to that portal's listing.
- The `--warn` token is amber.
- On phone width, the column field is hidden and the grid has one column.
- After the mouse leaves the map, the panel keeps the last district. This stops the panel from flickering between districts.
- The app picks "Pasa el mouse" or "Toca" with the media query `(hover: hover)`.
- A project card in the workspace shows the badge of its own source, Nexo or Proper.
