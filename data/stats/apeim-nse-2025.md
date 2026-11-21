# NSE A to E, Lima Metropolitana 2025 (`apeim-nse-2025.csv`)

Source: APEIM, "Niveles socioeconómicos 2025" (síntesis), November 2025, built on INEI ENAHO 2024.
File: https://apeim.com.pe/wp-content/uploads/2025/12/Sintesis-Niveles-socioeconomicos-2025.pdf

Indicators: `nse_a_pct` to `nse_e_pct`, the share of households in each level. Place: `lima-metropolitana`, all 43 districts.

Values from page 14 ("Lima Metropolitana, distribución de hogares según NSE 2025"), read from the PDF text: A 2.6%, B 18.4%, C 45.5%, D 26.9%, E 6.6%. They add up to 100%.

APEIM is the Peruvian market research association, not a government office. Its NSE levels are the national standard for this classification. APEIM's "Lima Metropolitana" also includes Callao, so these shares are not for Lima province alone.

## Why not by zone

The plan wanted A to E per zone of Lima. APEIM's 2025 and 2023-2024 reports give only the all-Lima figures. The free Ipsos reports (Perfiles zonales 2021 and 2025, Perfiles socioeconómicos 2020) give zone profiles but no A to E split per zone. The last APEIM zone table found is from 2012, which is too old. When a newer zone table appears, add the zones to `places.csv` and a new data file.

Read on 2026-11-19.

## Income per level (checked 2026-11-21)

The 2025 síntesis publishes no income in soles per level. Page 10 gives only the share of income that each level spends (A 53%, B 65%, C 76%, D 79%, E 83%). The 2023-2024 report shows "Ingresos y Gastos según NSE 2023" only as images, and for all of Peru, not Lima. So the A to E bars on Mercado show no income, and the district panel uses the INEI strata ranges instead.
