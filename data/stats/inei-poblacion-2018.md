# District population 2018 (`inei-poblacion-2018.csv`)

Source: INEI, "Mapa de pobreza monetaria provincial y distrital 2018", the population column of the main district table ("Publicación (Parte 2)").
File: https://cdn.www.gob.pe/uploads/document/file/3340934/Publicaci%C3%B3n%20%28Parte%202%29.pdf

Indicator: `population`, people in the district in 2018, as INEI used for the poverty map.

The rows for Lima province (codes 150101 to 150143) were read from the PDF text, with the same row match and name check as `inei-pobreza-2018.csv`.

Newer data exists: INEI published district results of the Censos Nacionales 2025 in July 2026, but only on an interactive site (https://censos2025.inei.gob.pe/), with no file to download yet. When a table is available, add `inei-poblacion-2025.csv` with period `2025`. It then wins as the newest period.

Read on 2026-11-19.
