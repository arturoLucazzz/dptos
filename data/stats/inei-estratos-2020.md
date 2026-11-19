# INEI income strata 2020 (`inei-estratos-2020.csv`)

Source: INEI, "Planos estratificados de Lima Metropolitana a nivel de manzana 2020".
Link: https://www.inei.gob.pe/media/MenuRecursivo/publicaciones_digitales/Est/Lib1744/libro.pdf

Indicator: `high_income_pct`, the share of a district's people in the "Alto" stratum.

## What "Alto" means

INEI gives each city block (manzana) an estimated household income per person, from a model built on the 2017 census and other INEI studies. A block is "Alto" when that income is S/ 2,412.45 or more a month, at real prices. For a family of four, that is about S/ 9,650 a month for the whole household.

The share counts the people who live in "Alto" blocks. It does not say that every resident earns that much. A district at 100% has every block above the line.

The top stratum has no ceiling. San Isidro, Miraflores, Magdalena del Mar, and Jesús María all show 100%, so this source cannot rank them against each other.

## How the values were read

The PDF text comes out in a scrambled order, because street names on the maps overlap the tables. So the table "Población y manzanas (unidades)" on each district page was cut out as an image and read by eye. The pages are 17 (Lima) to 59 (Villa María del Triunfo), one per district in INEI code order.

For each district, the five persons counts (Alto, Medio alto, Medio, Medio bajo, Bajo) were checked to add up to the printed total. All 43 rows pass. The raw counts are in `docs/superpowers/plans/2026-11-19-inei-strata-readings.csv`.

Value = round(100 × Alto persons / total persons, 1). Read on 2026-11-19.
