# Location score and local rent

Date: 2026-11-16. Status: draft for the owner.

This document is piece 2 of 4. The order is: 1. investor numbers and seed (merged as PR #2), 2. location score, 3. UI redesign with map and cards, 4. AI chat and access for other investors.

## Intent

The platform is built for investors (README, "Nuestro mantra"). Take two apartments with the same numbers. If one is two blocks from Parque Castilla and the other is next to a loud highway, they are not the same investment. The owner knows Lima: San Isidro is almost always beautiful, so anything near it is pretty too, and the streets around Parque Castilla are great. This piece puts that knowledge, plus free public data, into one location score from 0 to 10 for each apartment.

The piece also fixes the rent estimate. Today it uses one median per district and bedroom count. Inside one district, rents can go from S/ 1,500 to S/ 2,500. An apartment next to the expensive zone gets a rent that is too low. An apartment in a cheap pocket gets a rent that is too high. The second error is the dangerous one, because it flatters the numbers.

## Goals

- Each apartment in Lima shows a location score from 0 to 10 in its own column, with the reasons in plain Spanish.
- Half of the score is livability and half is tenant demand. The owner weighs them the same.
- The owner marks zones and rates them from 0 to 10. A zone is a whole district or a point with a radius.
- The owner filters by location, for example "Ubicación ≥ 7". The default sort stays on the monthly gain.
- The rent estimate uses the rent listings near the apartment. The money numbers use the middle of those rents.
- The high end of the nearby rents shows as a line of text, for example "Los mejores cercanos: S/ 2,500".

## Non-goals

- Shapes drawn on a map. They come with the map in piece 3. Zones live in the database, so a drawn shape later replaces a circle without changes to the score.
- The map and the cards (piece 3).
- Zones per investor. In piece 4, each investor can keep their own zones or see the owner's zones.
- Income per block. INEI publishes it only as PDF maps.
- Apartments outside Lima.

## Anti-goals

- A flattering rent. The money numbers never use the high end of the nearby rents.
- A score with no reasons. Every score names what raised it and what lowered it.
- A slow table. The score and the local rent are computed ahead and stored. A page load never calls an outside service.
- Heavy use of OpenStreetMap servers. The places download is one query per refresh, run by hand about once a month.

## Constraints

- Keep the stack: Next.js, Prisma, Postgres, node:test. No PostGIS. Distances use the haversine formula in TypeScript (the distance on a sphere from two coordinates).
- Pure domain code goes in `lib/`, with tests, like `lib/rent.ts` and `lib/finance.ts`.
- All UI text is in Spanish. Free sources only.
- The seed works with no network: OpenStreetMap places and district data come from files in the repository.
- A rent scrape (`pnpm scrape -- --operations=rent`) must run before the local rent is useful. The test copy had only 2 rent listings.

## Approaches

1. Compute ahead and store. A command downloads the OpenStreetMap places once and saves them. After each scrape and each zone save, a step computes every apartment's score and local rent and stores both. The table reads stored numbers. Chosen by the owner, because the table stays fast for piece 3.
2. Compute on each page load with PostGIS. Rejected: it adds a database add-on and more work on a page that is already slow.
3. A district table only, with ratings and INEI numbers. Rejected: every apartment in a district gets the same score, and the owner asked for the difference inside a district.

## Design

### Data

New tables:

- `Place`: one OpenStreetMap place. Fields: OpenStreetMap id, category, name, latitude, longitude.
- `Zone`: one owner zone. Fields: name, kind (`DISTRICT` or `CIRCLE`), rating from 0 to 10, and notes. A `DISTRICT` zone has a district slug. A `CIRCLE` zone has a latitude, a longitude, and a radius in meters.
- `DistrictStat`: one row per Lima district. Fields: income per person, police complaints per 10,000 people, the source and date of each number.
- `PropertyLocation`: one row per apartment. Fields: score, livability, demand, reasons, and the time of the computation. It also holds the local rent per m² (middle and high end), the number of rent listings used, and a district fallback flag.

District boundaries come from OpenStreetMap in the same download as the places. A `DISTRICT` zone needs them.

### Sources

- OpenStreetMap through the Overpass API (a free query service for OpenStreetMap data): places and district boundaries.
- INEI: income per person per district, typed once from the published PDFs into `data/location/district-stats.csv`, with the source and date on each row.
- Ministerio del Interior and INEI: police complaints per 10,000 people per district, typed the same way. The latest report found is from January 2026.
- The platform's own rent listings: how many there are near an apartment and how fast they go offline.

### Lima only

Lima means the 43 districts of the province of Lima. An apartment outside them gets no score and shows "Fuera de Lima". An apartment with no coordinates gets no score and shows "Sin ubicación exacta". Its rent falls back to the district median.

### Livability

The place count part counts these categories within 500 m:

- restaurants and cafés
- parks and plazas
- supermarkets and markets
- pharmacies, clinics, and schools
- bus and Metropolitano stops

Each category count becomes a percentile among the tracked apartments. Tracked apartments are the active sale units in Lima with coordinates. The place count part is the average of the categories, from 0 to 10.

The zone part uses the owner's zones. A zone can be good or bad. A stretch of Vía Expresa rated 2 lowers the score of the apartments next to it.

- Each zone has a reach from 0 to 1. Inside the zone, the reach is 1. Outside, it falls in a straight line to 0 at 500 m from the edge.
- The zone with the highest reach applies. If two zones tie, the smaller zone applies, because it is more specific. A circle around Parque Castilla inside a district zone wins over the district.
- The zone weight is 60% times the reach. Livability is the zone weight times the zone rating, plus the rest of the weight times the place count part.

Inside a zone, livability is 60% the zone rating and 40% the place counts. Two blocks from San Isidro, the reach is about 0.6, so San Isidro's rating still carries most of the zone weight. If no zone reaches the apartment, livability is the place count part alone.

### Tenant demand

Four signals, each a percentile among the tracked apartments, with equal weights:

- the number of rent listings within 1 km
- how fast rent listings within 1 km go offline (faster is better)
- income per person in the district (INEI)
- police complaints per 10,000 people in the district (fewer is better)

Demand does not use the rent level, because the money columns already use it. If a signal is missing, demand averages the signals that exist, and the reasons say which signal is missing.

### The score

The score is half livability and half demand, from 0 to 10, with one decimal. The parts use percentiles. The score is their plain average and is not ranked again. The scale compares the apartments the platform tracks: 10 is the best spot among them. New apartments change the scale, so a score can move a little.

Reasons, examples:

- "Cerca de Parque Castilla (tu zona, 9/10), a 200 m"
- "18 restaurantes y 3 parques a menos de 500 m"
- "Los alquileres cercanos se van rápido (mediana 21 días)"
- "Sin datos de delitos para este distrito"

### Local rent

For each apartment:

1. Take the rent listings with coordinates and the same bedroom group, within 1 km.
2. Keep the 15 nearest.
3. If 8 or more remain, the middle rent per m² times the area is the rent estimate. The 75th percentile times the area is the high end.
4. If fewer than 8 remain, use the district and bedroom median from `lib/rent.ts`, as today, and say so.

Every screen that uses a rent estimate today uses the local estimate. That includes "Ganas / Pones", the cash on day one, and the total you add. The table shows a line such as "Alquiler estimado S/ 2,200 (14 alquileres a menos de 800 m). Los mejores cercanos: S/ 2,500."

### Zones screen

A new page, `/zonas`, lists the zones and has a form to add or edit one:

- name and notes
- kind: district, or point and radius
- for a point: a Google Maps link or typed coordinates
- radius in meters, with a default of 400
- rating from 0 to 10

Saving a zone recomputes the apartments that the zone reaches, so the table shows the new score on the next load.

### Commands

- `pnpm location:places`: downloads the places and district boundaries for Lima into `Place` and saves a copy in `data/location/`. Run it by hand about once a month.
- `pnpm location:refresh`: loads the district stats file and recomputes every apartment. The scrape runs it at the end of each run.

### Table

- New column "Ubicación" with the score. The reasons show on hover and in the row details.
- New filter "Ubicación mínima" (URL field `ubicacion`).
- A sort by location is available. The default sort stays on the monthly gain.

### Seed

The market seed adds:

- a places file and a district stats file from the repository, with no network
- two example zones: San Isidro as a district rated 9, and Parque Castilla as a point rated 9
- investor cases:
  - an apartment in Lince next to San Isidro, with a high score
  - an apartment in Lince far from any zone, with a lower score
  - an apartment whose local rent is above its district median

## Calls made by the designer

- A zone's reach fades to zero at 500 m from its edge. The reach scales the zone's weight, not its rating, so a bad zone lowers nearby scores.
- With several zones, the zone with the highest reach applies, and a tie goes to the smaller zone. Ratings do not add up.
- Inside a zone, livability is 60% the zone rating and 40% the place counts.
- The final score is the plain average of the two parts and is not ranked again.
- Apartments with no coordinates get no score. Projects get no score in this piece. The map in piece 3 can add them.
- Percentiles among tracked apartments set the scale, so 10 is the best tracked spot.
- Local rent uses the 15 nearest rent listings within 1 km, needs at least 8, and the high end is the 75th percentile.
- Lima is the 43 districts of the province of Lima. Callao is out.
- The default radius of a point zone is 400 m.

## Left to the builder

- The exact OpenStreetMap tags for each category.
- The shape of the reasons in the database.
- How the scrape calls the refresh step.
- The exact district stats numbers, typed from the cited PDFs.
- The layout of the `/zonas` page in the current UI.
