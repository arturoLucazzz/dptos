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

## All five strata (added 2026-11-21)

Indicators: `stratum_alto_pct`, `stratum_medio_alto_pct`, `stratum_medio_pct`, `stratum_medio_bajo_pct`, `stratum_bajo_pct`, the share of a district's people in each stratum. They come from the same readings file as `high_income_pct`, with the same formula: round(100 × stratum persons / total persons, 1). `stratum_alto_pct` equals `high_income_pct` for every district, and the five shares of a district add up to between 99.9 and 100.1 because of rounding.

The income range of each stratum is in `inei-estratos-2020-rangos.csv`. It is monthly household income per person, in soles, for the Lima region. The values are the ones printed in the legend of every district page (pages 17 to 59), which rounds Cuadro N° 4 ("Estratificación regional de ingresos per cápita del hogar por el método de Dalenius, 2020") to two decimals:

- Alto: S/ 2,412.45 or more
- Medio alto: S/ 1,449.72 to 2,412.44
- Medio: S/ 1,073.01 to 1,449.71
- Medio bajo: S/ 863.72 to 1,073.00
- Bajo: S/ 863.71 or less

The ranges file is not a stat file, so `lib/stats/store.ts` lists it with the catalog files and `stats:load` does not read it.
