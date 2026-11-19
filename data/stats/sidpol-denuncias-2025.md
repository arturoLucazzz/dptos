# Police complaints 2025 (`sidpol-denuncias-2025.csv`)

Source: SIDPOL-PNP, compiled by the MININTER Observatorio Nacional de Seguridad Ciudadana, "Reporte de denuncias registradas en el SIDPOL a diciembre 2025" (figures as of 2025-12-31).
Page: https://www.gob.pe/institucion/mininter/informes-publicaciones/7620309-reporte-de-denuncias-registradas-en-el-sidpol-a-diciembre-2025
File: https://cdn.www.gob.pe/uploads/document/file/9290186/7620309-reporte-de-denuncias-registradas-en-el-sidpol-a-diciembre-2025.pdf

Indicator: `complaints_per_10k`, complaints in 2025 per 10,000 residents. Period `2025-01..2025-12`.

## How the values were read

Table V.1 on page 29 lists, per district, the January to December complaints of 2024 and 2025 in five crime groups: property ("patrimoniales"), public safety, life and body, liberty, and public administration. The page is an image, so it was rendered at high resolution and read by eye.

Value = the sum of the five 2025 groups / population × 10,000, rounded to one decimal. Population is `inei-poblacion-2018.csv`, the newest INEI district figure available as a file.

Lima (Cercado) and San Juan de Lurigancho have no value. Their 2025 property cell prints "#####", because the number is too wide for the cell. The table marks Lima and Lince with "**" and gives no note for it on that page.

## Context only

This indicator failed the sense check: San Isidro (423) and Miraflores (575) rank 9th and 10th of the 11 app districts. Shoppers, tourists, and office workers file complaints in commercial districts, so the count per resident says little about living there. It stays in the statistics as context and is not part of the location score (`SCORE_LEFT_OUT` in `lib/location/score.ts`).

Read on 2026-11-19.
