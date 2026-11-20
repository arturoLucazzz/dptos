# UI redesign: Inicio, Mis inversiones, Mercado

Roadmap piece 3. Status: design (2026-11-20). The approved mockup (v4, dark mode, real data) is the visual reference. It lives in `.superpowers/brainstorm/` on the owner's machine.

## Intent

dptos is a tool for picking the best apartment investment in Lima. The owner uses it now, and other investors (mostly Spanish speakers) will use it later. The current interface is one large table. The owner wants an app that matches how an investment is actually evaluated, and that explains the market.

An evaluation is called an "inversión". The owner picks zones, projects, and apartments, compares prices, visits, writes notes, and ends with a final list. That list goes to an Excel sheet, where the bank numbers continue. The owner never comes back to a finished inversión. Several inversiones can run at the same time.

## Goals

- Opening the app shows a home page (Inicio) with the last inversión to continue, the other inversiones, and recommended deals.
- An inversión is a free workspace with no forced steps: filters, sort options, a large map, listing cards, and a side panel. The owner drags cards into the panel, or adds them from the map.
- A comparison page shows every pick side by side and exports to Excel.
- A market page (Mercado) explains how prices, rents, projects, and people are distributed in Lima.
- One quick settings window holds the money assumptions. Changing them recalculates every number in the app.
- Every number that is not obvious has a short explanation on hover.
- The app works on a phone, for example to write a note during a visit.
- Screens feel fast.

## Non-goals

- Light mode. The app is dark only for now.
- Accounts, logins, and sharing. Piece 4 adds them. Until then, inversiones and assumptions belong to the single owner.
- AI news search and chat. Piece 4.
- Storing the outcome of an inversión (bought, dropped). The final list and its export are enough.
- Rent listings as cards. Cards are sale apartments and projects.

## Anti-goals

- A wizard. The owner explicitly does not want a fixed order of steps.
- A number with no meaning to the reader. Every indicator says what it is, and per-m² prices appear only where they compare different sizes (yield).
- Influencer or portal content that looks neutral but comes from someone who sells advice. If the author sells advice, the profile shows "vende asesoría".
- A slow map. 10,000 pins drawn one by one is not acceptable.

## Constraints

- Build inside the current Next.js 16 app. Reuse the server code that filters, ranks, and computes the investor numbers: `lib/departamentos-query.ts`, `lib/listing-finance.ts`, and `lib/listings.ts`. The money logic stays in one tested place.
- New packages are allowed. The goal is an app that looks and works well.
- Map tiles must be free and need no account: OpenFreeMap vector tiles. The standard OpenStreetMap tile servers forbid this use.
- Screen text is Spanish. Lima province only.
- The real database is `dptos`. Migrations run as the owner `arturoLucazzz`. Back up before changes.

## Approaches

1. Rebuild inside the current app, one screen at a time, on the existing server code. Chosen. The money logic stays tested and shared, and each step ships working.
2. A separate front-end app talking to an API. Rejected: duplicated logic, two apps, two deploys, for a single-person project.
3. Restyle `/departamentos` into cards and add a map. Rejected: it keeps the old structure, and inversiones, Inicio, and Mercado become add-ons.

## Decisions taken with the owner

### Navigation

A top bar with "Inicio", "Mis inversiones", and "Mercado", plus a pill on the right that reads "Supuestos: TEA 8.5% · inicial 20% · 20 años". The pill opens the settings window.

### Look

- Dark mode. Background near black, surfaces charcoal, thin borders.
- Emerald for actions and gains, rose for losses, violet only for the location score, so that it never reads as money.
- Inter font, Lucide icons, rounded cards, soft shadows.
- The listing card is photo first. The location score badge sits in the top right corner of the photo. An add button sits in the top left, visible on hover and always visible on a phone. Below the photo: the price, "beds · m² · district", and one money line ("Ganas S/ X/mes" or "Pones S/ X/mes"). The card has no other buttons.

### Inicio

- A strip of four market numbers on top, each with a plain caption: typical sale price (median of the listings in the tracked districts), typical monthly rent, gross yield, and sale listings seen in the last 7 days.
- "Continuar" with the last inversión opened, its pick count, and thumbnails. "Otras inversiones" with "+ Nueva inversión".
- "Recomendados": 16 to start, with "Ver más". Tabs: best monthly gain, highest yield, below market price, best location, newest. A cards or table view switch, and 2 to 6 columns in card view.

### Mis inversiones (workspace)

- Filter chips on top: districts, price, bedrooms, more. Sort chips: monthly gain, gross yield, return on cash, below market, price per m², price, cash on day one, location, newest.
- A large map (about 30rem tall) that folds away. Clicking a pin opens a small card with "Agregar a la inversión". Nothing is added without that click. Drawing a zone on the map filters the cards. A drawn zone can be saved and rated, which replaces the `/zonas` page.
- Cards in a grid of up to 4 columns on wide screens.
- A side panel with the inversión's name, its picks (thumbnail, price, district, money line, a one-line note), "Comparar", and an export icon. Cards are added by drag and drop or the add button.
- On a phone, cards stack in one column, the map starts folded, and the panel is a bottom sheet.

### Comparar

The page has one column per pick and one row per number. The best value in each row is highlighted, and the notes are at the bottom. The rows are price, price per m², area, estimated rent, bank payment, monthly gain, gross yield, cash on day one, and location. "Exportar a Excel" writes this table, one row per pick, with the listing links. On a phone, it shows one pick at a time.

### Mercado (one dashboard page)

1. Market numbers: typical sale price, typical monthly rent, gross yield, sale listings, projects.
2. "Alquiler mensual vs precio de venta" by district: bars for the typical sale price, a line for the typical monthly rent.
3. "Rentabilidad bruta por distrito", with the best three highlighted.
4. "Cómo se reparte Lima": a map of the 43 districts that switches between Ipsos zone household income, INEI share in high-income blocks, INEI poverty, and SIDPOL complaints. Tracked districts are outlined. A hover tooltip shows the value and zone. Next to it: the APEIM NSE A to E of Lima Metropolitana, with a note that no free source splits it by district.
5. "Dónde se construye" (projects per district) and "Cuántos avisos por precio" (a price histogram).
6. "Nuestras fuentes": per portal (Urbania, Adondevivir, Proper, Nexo), the listing count, typical prices, how many listings repeat across portals, and the change from the previous week. Computed from dptos's own scrape data.
7. "Estudios": links to market studies, for example the Urbania/Adondevivir monthly index and blog, the CODIP report built on Nexo data, and the BCRP "Notas de estudios". Each one says that the figures are asking prices, not sale prices.
8. "Voces del mercado": influencer profiles with a link, platform, and topic. If a creator sells advice, the profile carries a "vende asesoría" tag. The owner reviews the list before it is published.
9. "Noticias": headlines with links from RSS feeds, filtered by keywords, with a save button and a saved list. Gestión comes first. If their feeds work, El Comercio and Andina follow.

Removed after review: the list of the highest-yield listings.

### Settings window (Supuestos)

TEA, down payment, term, and purchase costs, with sliders and the standard value shown next to any changed one. Changing a value recalculates every money number in the app: cards, recommendations, the panel, Comparar, and Mercado. "Volver al estándar" resets. It replaces today's assumptions panel.

## Builder calls (made in this design, open to the owner)

- Libraries:
  - `maplibre-gl` through `react-map-gl/maplibre`, with the map's built-in clustering
  - `@dnd-kit/core` for drag and drop, which also works with touch
  - `recharts` for charts. The mockup used Chart.js, so the charts can look slightly different.
  - `lucide-react` for icons, `next/font` for Inter, and `exceljs` for the Excel file
- Theme: Tailwind 4 tokens with semantic names (surface, border, text-muted, gain, loss, score, brand), so that a light mode can be added later without rewriting screens.
- Data: new tables `Investment` (name, filters as JSON, created, updated, last opened) and `InvestmentItem` (investment, property or project, note, position). The existing favorite and note columns on `Property` are migrated into a first inversión called "Favoritos", then left unused.
- Assumptions: stored in a cookie for now, so that the server computes the same numbers that the screen shows. Piece 4 replaces the cookie with a per-account setting. The URL parameters of `/departamentos` stop being the source.
- Studies, influencers, and RSS feed addresses live as editable files in `data/market/`, like `data/stats/`. News items are stored in a `NewsItem` table with a saved flag, filled by a `pnpm news:fetch` command.
- Speed: the server filters, sorts, and pages. The browser receives one page of cards and one map layer of points for the current view. Targets on the owner's machine: Inicio and Mis inversiones load in under 2 seconds, and filter or sort changes answer in under 300 ms.
- Old pages: each replaced page goes away once its replacement ships. That covers `/departamentos`, `/favoritos`, `/zonas`, `/estadisticas`, and `/alertas`. `/agregar` (manual entry) becomes a button. `/runs` stays as an owner page.

## Steps

Each step gets its own plan and ships working:

1. Base and Inicio: theme, navigation, settings window, Inicio.
2. Mis inversiones: workspace, map, panel, drag and drop, Comparar, Excel export, phone layout, inversiones in the database, drawn zones.
3. Mercado: dashboard, district map, our sources, studies, voices, news.
4. Cleanup: remove the replaced pages.

## Left to the builder

- Exact component structure and file names, following the existing app.
- The keyword list for news, and which RSS feeds work.
- Breakpoints for the phone layout.
