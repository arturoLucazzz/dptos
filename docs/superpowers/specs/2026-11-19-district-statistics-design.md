# District statistics store

Sub-project between roadmap pieces 2 (location score) and 3 (UI redesign). Status: design.

## Intent

The owner wants official statistics about Lima in the platform: income, poverty, crime, socioeconomic level (NSE A to E), and later age, gender, and more. The statistics have two uses:

1. The location score reads a few of them as tenant demand signals.
2. The rest is context. It shows how Lima is distributed, so that the owner and later other investors understand each place. The piece 3 map and district pages read it.

When new reports come out, about once a year, the owner updates the numbers. Each update is a new row. The platform always uses the most recent row of each indicator.

## Goals

- One table holds every statistic, one row per place, indicator, and period.
- A new indicator or a new period needs data files only, not code or a migration.
- The location score reads its indicators at the latest period.
- Every value can be traced to its source document and page.
- The first data: INEI income strata 2020, INEI poverty, SIDPOL crime, district population, and NSE A to E by Lima zone.

## Non-goals

- No time series views. Older periods stay in the table and in git, but nothing shows change over time yet.
- No loading of older editions (for example INEI strata 2013). Only the most recent value of each indicator.
- No automatic download or scraping of statistics. The owner or Claude reads each report and writes the CSV.
- No district statistics page. Piece 3 builds the screens.
- No data below district level. INEI publishes block-level income only as printed maps.

## Anti-goals

- A number that ranks a rich district below a middle one, like the PNUD 2019 income table that put San Isidro below Lince. Each new score indicator passes a sense check against known districts before it enters the score. A source that fails is left out.
- A value with no source. The loader rejects rows without a source.
- Counting one thing twice in the score. NSE and income strata both measure income, so NSE stays out of the score.

## Constraints

- Sources are official and free: INEI, the police SIDPOL system through MININTER, and APEIM for NSE. APEIM is the market research association, not a government office. It is the national standard for NSE, so it is accepted as context.
- The real database is `dptos`. Migrations run as the owner `arturoLucazzz`, because the `.env` user cannot alter tables. Back up before changes.
- Lima province only: the 43 districts in `lib/location/lima-districts.ts`.
- Screen text is Spanish.

## Approaches

1. A statistics table fed from CSV files in the repo, one file per source, with a load command. Chosen. It gives one row per update with no code change, and the score and piece 3 both read the database.
2. More columns in `DistrictStat`. Each indicator needs a migration, and an update overwrites the old value. Rejected.
3. CSV files only, read at refresh time. It is cheap, but piece 3 needs the numbers in the database, and reading files from disk fails on a hosted server. Rejected.

## Design

### Data files

Directory `data/stats/`, committed.

- `indicators.csv`: the catalog. Columns `indicator,label,unit,description`. Example: `high_income_pct,Vecinos en estrato de ingreso alto,%,Personas que viven en manzanas con ingreso per cápita del hogar de S/ 2,412.45 o más al mes (INEI).` A data row with an indicator not in the catalog is an error.
- `places.csv`: places that are not districts. Columns `place,kind,label,districts`. Example: `apeim-zona-7,zone,Zona 7 (APEIM),miraflores;san-isidro;san-borja;santiago-de-surco;la-molina`. A district place is its slug from `lima-districts.ts` and needs no row.
- One data file per source and period, for example `inei-estratos-2020.csv`. Columns `place,indicator,value,period,source,source_ref`. `period` is a sortable text: `2020`, `2025-10`, or `2024-11..2025-10` for a 12-month window (sorted by its end). `source` names the document. `source_ref` names the page or table.
- A file can hold several indicators, for example the five NSE levels of every zone.
- Each data file has a short notes file next to it, `<name>.md`. The notes give the document link and say how the values were read: typed, read from an image, or computed from two numbers.

### Table

`Statistic`: `id`, `place` (text), `indicator` (text), `value` (decimal), `period` (text), `source` (text), `sourceRef` (text), `file` (text), `loadedAt`. Unique on `(place, indicator, period)`.

The table mirrors the files. `pnpm stats:load` reads all files, checks them, and replaces every row in one transaction. Git holds the history of the files. Running the command twice gives the same table.

Checks, with Spanish error messages that name the file and row:

- the header is exact
- the place is a Lima district slug or a row of `places.csv`
- the indicator is in `indicators.csv`
- the value is a finite number
- the source is not empty
- no two rows share place, indicator, and period, across all files

After a successful load, the command runs the location refresh, so the scores use the new numbers.

### Latest value

A helper returns, for each place and indicator, the row with the greatest period. The score and piece 3 use only this helper.

### First data

| Indicator | Place | Source | Use |
|---|---|---|---|
| `high_income_pct` | district | INEI, Planos estratificados de Lima Metropolitana a nivel de manzana 2020, "Alto" share of persons, pages 17 to 59 | score |
| `poverty_pct` | district | INEI, latest district poverty map (Mapa de pobreza monetaria provincial y distrital) | score |
| `complaints_per_10k` | district | SIDPOL complaints over the latest 12 months published, divided by `population`, times 10,000 | score |
| `population` | district | INEI, latest district population figure | context, and the crime rate |
| `nse_a_pct` to `nse_e_pct` | APEIM zone | latest APEIM edition with the Lima zone breakdown. If APEIM has none, Ipsos, and the source says so | context |

The INEI strata table readings from 2026-11-19 are the first `high_income_pct` file. Each row was checked against its printed total.

Sense check before an indicator enters the score: San Isidro, Miraflores, and San Borja must rank in the better third of the 11 app districts. If a source fails, its file still loads as context, and the score leaves it out.

### Score changes

Demand signals become, each a percentile among tracked apartments with equal weight:

1. live rent listings within 1 km (unchanged)
2. how fast nearby rents go (unchanged)
3. `high_income_pct`, higher is better
4. `poverty_pct`, lower is better
5. `complaints_per_10k`, lower is better

A missing value drops that signal, as today. Reasons:

- "N% vive en manzanas de ingreso alto (INEI 2020)", tone up or down by percentile
- "Pobreza baja en el distrito (INEI 2018)" or "Pobreza alta en el distrito (INEI 2018)"
- "Pocas denuncias en el distrito (SIDPOL)" or "Muchas denuncias en el distrito (SIDPOL)"
- The year in each reason comes from the period of the value used.

### Removed

- `data/location/district-stats.csv`, `lib/location/district-stats.ts`, and its tests.
- The columns `incomePerCapitaPen`, `incomeSource`, `incomeDate`, `complaintsPer10k`, `complaintsSource`, and `complaintsDate` in `DistrictStat`. The table keeps the slug, name, and boundary from `location:places`.
- The README section on district stats is rewritten for `data/stats/`.

### Seed

The seed runs the same loader on the committed `data/stats/` files, so that the seed shows the same reasons as the real database. The files cover all 43 districts, so no separate seed data is needed. (Builder call.)

## Left to the builder

- The exact poverty map edition and the population source, as long as both are INEI and the newest available.
- How many SIDPOL monthly reports make the 12-month window, and how the crime categories are summed. The notes file records the choice.
- The search for the APEIM zone breakdown, and the zone-to-district list.
- Names of helper functions and files, following the existing `lib/location/` style.
