# INEI district poverty 2018 (`inei-pobreza-2018.csv`)

Source: INEI, "Mapa de pobreza monetaria provincial y distrital 2018", published 2020. It is the newest INEI district poverty map.
Page: https://www.gob.pe/institucion/inei/informes-publicaciones/3204872-mapa-de-pobreza-provincial-y-distrital-2018
File: "Publicación (Parte 2)", https://cdn.www.gob.pe/uploads/document/file/3340934/Publicaci%C3%B3n%20%28Parte%202%29.pdf

Indicator: `poverty_pct`, total monetary poverty, in % of people.

## How the values were read

The main table ranks every district of Peru and gives a 95% confidence range of poverty for each one, not a single number. The rows for Lima province (codes 150101 to 150143) were taken from the PDF text, which reads cleanly here. The district names were checked against the slugs. The province total row (150100) is not used.

Value = the middle of the range, (lower + upper) / 2. For example, Lince is 0.8 to 2.1, so 1.45. `source_ref` keeps the page and the range.

A separate INEI document ("Desagregación de distritos") gives single estimates, but only for districts with 20,000 or more households. Barranco, Lince, Magdalena del Mar, and other small districts are missing there, so it is not used.

Read on 2026-11-19.
