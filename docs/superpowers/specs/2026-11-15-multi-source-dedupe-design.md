# Multi-source listings and dedupe

Date: 2026-11-15. Status: approved by the owner.

This document is project 1 of 3. Project 2 is UI speed. Project 3 is context data (BCRP, INEI, SBS), Mastra, and access for other investors.

## Intent

The owner uses dptos to find the best apartment investment in Lima. Today dptos reads only Urbania. One apartment is often on several sites at different prices, and the lowest price is the real negotiating anchor. This project adds more listing sources and merges the copies of one apartment into one record. The ranking then shows each apartment once, with every price it has.

Later, other investors (technical and non-technical, mostly Spanish speakers) will use the same platform. This project does not build that access, but it must not block it.

## Goals

- Read listings from Urbania, Adondevivir, Proper, Nexo Inmobiliario, and Remax.
- Let the owner enter a listing by hand, for example an ad from Facebook.
- Find the copies of one apartment across all sources and give each match a level: high, medium, or low.
- Merge high matches automatically. Show medium and low matches as possible duplicates that the owner confirms or rejects.
- Save every price from every copy. The lowest live price is the official price, and the ranking uses it.
- If a source gives unit prices (Proper), split the new project into its units. Each unit then gets its own analysis.

## Non-goals

- Paid scraping services or proxies.
- Context data from BCRP, INEI, SBS, or government studies (project 3).
- UI speed work (project 2).
- Mastra, user accounts, or hosting for other people (project 3).
- Photo fingerprints. This version stores the photo URLs so that a later step can add them.
- A separate page for projects. Projects exist as records for linking and dedupe only.

## Anti-goals

- A wrong merge. Merging two different apartments deletes real listings from every statistic, and nothing downstream can detect it. A missed duplicate is visible and can be fixed later. When unsure, the code must flag, never merge.
- A broken source that marks Lima as sold. If a source returns far fewer listings than its last run, its listings must keep their `lastSeenAt`.
- A lost price. No copy and no price change is ever deleted.

## Constraints

- Free methods only. Method A is a real headed browser. Method B is a browser session that passes Cloudflare once and then calls the JSON endpoint of the site. Each source uses A or B, and a source with no protection uses plain HTTP.
- Keep the current stack: Next.js 16, Prisma 7, Postgres, Playwright, and the pure domain code in `lib/`. Keep the 159 existing tests green.
- Keep the storage rule from `prisma/schema.prisma`: store only what was observed, compute everything else.
- The scraper runs on the owner's Mac through launchd.
- All UI text is in Spanish.
- Scraping is for the owner's own decisions. Before the platform opens to other investors, the terms of each site must be reviewed again (project 3).

## What the recon found (2026-11-14)

| Source | How the data loads | Method | Notes |
|---|---|---|---|
| Urbania | `POST /rplis-api/postings` returns the results as JSON inside a browser session | B | The current scraper reads `__PRELOADED_STATE__` from the HTML. |
| Adondevivir | Same platform and same endpoint as Urbania | B | Same ads as Urbania with different ids that are close in value, for example 151013036 and 151013410 for "Av. Prol. Iquitos 1766". The text is identical. |
| Proper | Public JSON: `get_proyects_departments` lists 49 projects. `/_next/data/<buildId>/proyecto/<slug>.json` gives each unit with price, area, bedrooms, bathrooms, unit number, expected rent, and coordinates. | Plain HTTP | No Cloudflare. The build id changes on each Proper deploy, so the adapter reads it from the page first. |
| Nexo | Server HTML with schema.org JSON-LD (`ItemList`). 780 projects in Peru. Prices are "desde". | Plain HTTP | No Cloudflare. Each card shows developer, building name, address with number, and area range. Unit prices on the project page: unknown. |
| Remax | Server HTML behind a Cloudflare challenge that passed without interaction | A | No JSON endpoint found. |

The same project is on three sources: "Prolongación Iquitos" in Lince is on Proper, Urbania, and Adondevivir at S/ 289,777.

## Approaches considered

Scraping method:

- A. Real headed browser for every source. Works everywhere, but slow and fragile.
- B. Browser once, then JSON endpoints. Fast and clean, but needs one endpoint per site.
- C. Paid unblocker. Runs without the Mac, but costs money every month.

The owner chose A and B, with no paid services. Each source uses B or plain HTTP where possible, and A as the fallback.

Data model:

- Extend the current tables. `Posting.source` takes new values, and new tables hold projects and duplicate candidates.
- Replace the schema with a new multi-source model.

The owner accepted the extension, because it keeps the history and the existing code.

Dedupe policy:

- Merge only exact matches (the current rule) and ignore the rest.
- Score every pair and merge above a threshold.
- Merge high matches, and flag medium and low matches for the owner.

The owner chose the third policy. The first misses most cross-source copies, because addresses are written differently. The second merges the units of a new building, which share street, coordinates, bedrooms, and similar prices.

## Design

### Source adapters

Each source is one adapter with the same contract:

1. Fetch. Download raw pages or JSON for a district and operation, and save them to `data/runs/<source>_<runId>_<operation>.ndjson`, as Urbania does today.
2. Parse. Turn the raw data into a normalized card that has the same shape for every source.

`pnpm replay` works for every source, because the raw data is saved before parsing.

Urbania and Adondevivir share one adapter with the domain as a parameter, because they run on the same platform. If the JSON endpoint fails, the existing Urbania HTML parser is the fallback.

The normalized card replaces `UrbaniaCardRaw` as the input of `ingestCards`. It adds these fields to what Urbania gives today: `buildingName`, `unitNumber`, `developerName`, `imageUrls` (all photo URLs), and `sourceUrl`.

`scraper/src/config/districts.ts` maps each district slug to the value that each source uses in its search.

### Data model changes

- `Posting.source`: new values `adondevivir`, `proper`, `nexo`, `remax`, and `manual`. The unique key `(source, sourcePostingId, operation)` stays.
- `PostingSnapshot`: new fields `buildingName`, `unitNumber`, `developerName`, `imageUrls`, and `sourceUrl`.
- New `Project` table: a building or development. Fields: name, developer, district, normalized address, coordinates, delivery date, stage. A `Posting` of kind `PROJECT` links to it, and a `Property` that is a unit of the project links to it.
- New `DuplicateCandidate` table: one row per pair of properties, and the pair is unique. It stores the level (`HIGH`, `MEDIUM`, `LOW`) and the signals that fired (JSON). It also stores the status (`OPEN`, `CONFIRMED`, `REJECTED`) and the decision date.
- `ScrapeRun`: counts become `source → district → operation`, and the run records which sources it covered.

### Dedupe

The current rule in `lib/fingerprint.ts` (same address with a number, area within 2 m², price within 5%) stays and becomes one of the high rules. Matching uses prices converted to soles with the single `usdPen` value.

| Level | Signals | Action |
|---|---|---|
| High | Urbania and Adondevivir copy: same title, price, area, and normalized address. Or the current rule. Or same building name and same unit number. | Merge into one `Property` automatically. |
| Medium | Same building name or same developer, same bedrooms, area within 2 m², price within 10%, coordinates within 150 m, but no door number. | Create a `DuplicateCandidate` with level medium. Keep separate rows. |
| Low | Same street without a number, same bedrooms, area within 5 m², price within 10%. | Create a `DuplicateCandidate` with level low. Keep separate rows. |

The same publisher alone never raises a level, because one developer sells many identical units in one building.

If the owner confirms a candidate, the two properties merge. All postings move to one property. If one of the two was a favorite, the merged property is a favorite. The notes of both are joined. If the owner rejects a candidate, the pair is never flagged again. A merged group also has a "no es el mismo" action. It splits the group and records the pair as rejected, so the owner can undo an automatic high merge.

Confirmed and rejected pairs are saved as test fixtures, so the levels can be tuned against real decisions.

### Official price

The official price of a property is the lowest current price among its live postings. The ranking, coverage, yield, and fair price use it. All other prices stay in the snapshots.

### Projects and units

A project record links the copies of one building across sources. If Proper gives units, each unit becomes a `UNIT` posting with its own property, linked to the project. Each unit enters the ranking with its real price. A project with only a "desde" price stays out of the ranking, as today.

Proper also publishes its own expected rent and ROI per unit. These are stored in the raw card as the source's estimate. They do not feed the rent index, because they are not market listings.

### Manual entry

The owner finds some listings outside the scraped sites: Facebook ads, Instagram ads, Google, developer websites, and buildings seen in the street. Some are single apartments, and many are new projects. A new page, `/agregar`, has a form with two modes.

Single unit mode:

- Required: link, price, currency, operation, district, bedrooms, area. The ranking and dedupe need these.
- Optional: address, building name, unit number, publisher, bathrooms, parking spots, photo URLs, notes.

Project mode:

- Project fields, entered once. Required: name, district. Optional: developer, address, delivery date, stage, link, notes.
- A table of units or unit types, one row each. Required: price, currency, bedrooms, area. Optional: unit number or type name, bathrooms, parking spots.
- Each row becomes a `UNIT` posting linked to the project, so each one enters the ranking.

The link can be empty, because a building seen in the street has no link.

A manual listing goes through the same ingest and dedupe as a scraped one. It does not expire through `lastSeenAt`, because no scraper sees it again. It stays live until the owner marks it as sold or removed.

### Sanity gate

The gate works per source and district. If a source returns less than 20% of its last count for a district, the gate leaves `lastSeenAt` untouched for that source and district only.

### UI changes

- Each row shows the official price. If a property has several copies, the row also shows a short note and a link to each ad. Example note: "3 fuentes · S/ 399k a S/ 420k".
- A badge "posible duplicado (media)" or "(baja)" links the two rows, with the buttons "es el mismo" and "no es el mismo".
- A source filter in the table.
- `/runs` shows health per source.

### Schedule

All sources run in the existing launchd jobs: daily at 3 am for the tracked districts, and Saturday for all of Lima. Proper and Nexo are small and run daily for all districts. If the Mac sleeps at 3 am, launchd runs the job when the Mac wakes. If the Mac is off, the run is lost.

### Testing

- Each adapter has parse tests from saved real responses.
- Dedupe rules have tests from real pairs, starting with the "Prolongación Iquitos" copies on Urbania, Adondevivir, and Proper.
- The existing 159 tests stay green.

## Calls made by the designer

These choices were not discussed with the owner. Each one can be changed.

- The fields of the manual entry form, and that manual listings expire only by hand. The owner chose manual entry for projects found outside the scraped sites, with project mode.
- The thresholds in the dedupe table.
- Photo URLs are stored now, and photo fingerprints come later.
- How a confirmed merge combines favorite and notes.
- The "no es el mismo" action on automatic merges.
- Proper rent and ROI estimates do not feed the rent index.
- Rent ads go through the same dedupe as sale ads. Without it, the Adondevivir copies of Urbania rent ads count twice in the rent index.
- All sources run in the existing launchd jobs.

## Left to the builder

- The exact request body and paging of the Urbania and Adondevivir JSON endpoint.
- Nexo paging, and whether its project pages give unit prices.
- Remax HTML selectors and paging.
- The district slug map for each source.
- The order of adapters. The suggested order is Adondevivir first, because it overlaps most with Urbania and tests the high rule, then Proper, Nexo, Remax, and manual entry.
- The migration steps for existing data.
