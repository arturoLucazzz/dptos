# dptos

Herramienta para analizar departamentos en venta en Lima: scrapea Urbania, guarda solo lo observado en Postgres, y calcula en el cliente cobertura de cuota, precio justo y probabilidad de rebaja.

## Arquitectura

```
Urbania.pe
    │
    ▼
scraper/  (Playwright, headed) ──NDJSON──► data/runs/
    │
    ▼ ingest
Postgres (Prisma)
    │
    ├── ScrapeRun          historial y salud de cada corrida
    ├── Posting            identidad del aviso (id de Urbania)
    ├── PostingSnapshot    precio/features solo cuando cambian
    ├── Property           departamento físico (agrupa reposts)
    └── Assumptions        UIT, tasas, costos — una sola fila
    │
    ▼ queries + modelos en memoria
lib/  (dominio puro + loaders)
    │
    ▼ proyecciones delgadas (~10 números/fila)
app/  (Next.js) ── panel de supuestos en URL ──► tablas y dashboards
```

### Principio: guardar poco, calcular mucho

Solo se persiste lo que no se puede reconstruir mañana (`firstSeenAt`, `lastSeenAt`, el precio publicado, el `rawCard`). Todo lo demás — cobertura, descuento, yield, predial, probabilidad de rebaja — se calcula on-demand.

Por eso el panel de supuestos (inicial, TEA, TCEA, plazo) vive en el query string y recalcula la tabla en el cliente: mover un slider no toca el servidor.

### Identidad

| Concepto | Qué es | Clave |
|---|---|---|
| **Posting** | Un aviso de Urbania | `(source, sourcePostingId, operation)` |
| **Property** | El departamento físico | fingerprint + match conservador |
| **Snapshot** | Una observación del aviso | solo si cambió un campo trackeado |

El matcher de properties es deliberadamente estricto: exige dirección normalizada **con número**, área ±2 m² y precio ±5%. Sub-mergear deja duplicados visibles; sobre-mergear destruye observaciones en silencio.

### Modelos en memoria (no columnas)

- **Precio justo** (`lib/fair-price.ts`): regresión log-log sobre ventas `UNIT` vivas. Cache invalidada cuando termina una corrida.
- **Alquiler estimado** (`lib/rent.ts`): mediana S//m² por distrito × dormitorios.
- **Edad del aviso** (`lib/posting-age.ts`): cuando falta `firstDateOnline`, se estima con id→fecha (ids de Urbania son aproximadamente secuenciales).
- **Costos y finanzas** (`lib/costs.ts`, `lib/finance.ts`): funciones puras; corren en el navegador.

### Compuerta de sanidad

Si un distrito trae &lt;20% de lo que trajo la corrida anterior, **no** se toca `lastSeenAt`. Evita que un parser roto marque Lima entera como vendida.

## Estructura

```
app/                  Next.js (App Router)
  departamentos/      ranking por cobertura + panel de supuestos
  estadisticas/       precios (vivos vs salidas), inventario, pipeline
  alertas/            bajadas y nuevos con cobertura alta (24h)
  favoritos/          Property.favorite (sobrevive a reposts)
  runs/               salud de ScrapeRun
lib/                  dominio compartido (app + scraper)
  finance.ts          cuota, cobertura, año de cruce
  fair-price.ts       regresión de precio justo
  fingerprint.ts      agrupación en Property
  listings.ts         proyección delgada para la UI
  analytics.ts        índices y pipeline
  alerts.ts           cambios recientes
scraper/              worker de Urbania
  scrapers/urbania/   parse (__PRELOADED_STATE__ + DOM), bandas de precio
  db/ingest.ts        escritura a Prisma + sanity gate
prisma/               schema + migraciones + seed sintético
ops/launchd/          jobs diarios/semanales
scripts/              wrapper con kill switch y caffeinate
```

## Setup

```bash
pnpm install
cp .env.example .env          # DATABASE_URL=postgresql://...
pnpm exec playwright install chromium
pnpm db:migrate
pnpm db:seed                  # fila de Assumptions
pnpm db:generate
```

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | App en http://localhost:3000 |
| `pnpm scrape` | Scrapea y escribe a Postgres + NDJSON |
| `pnpm scrape --districts=lince --operations=sale,rent` | Un subconjunto |
| `pnpm scrape:probe` | Reporte de calidad de parseo (no escribe) |
| `pnpm replay --reset data/runs/*.ndjson` | Re-ingesta sin red |
| `pnpm db:seed:market -- --weeks=16 --reset` | Mercado sintético con precio conocido |
| `pnpm test` | Tests del dominio (159) |
| `pnpm typecheck` | `tsc` de la app y del scraper |
| `pnpm lint` | ESLint (flat config, Next) |
| `pnpm ops:install-launchd` | Instala jobs 3am diario + sábado |

### Kill switch y operación

```bash
# Pausar sin tocar launchd
SCRAPER_ENABLED=false   # en .env

# Correr ahora
launchctl kickstart -k gui/$(id -u)/com.dptos.scrape.daily

# Logs
tail -f ~/Library/Logs/dptos/scrape-$(date +%Y-%m-%d).log
```

Urbania bloquea Chromium headless (403). El scraper corre **headed** por defecto. Ver `.env.example` para `SCRAPER_HEADLESS`, canales de Playwright, etc.

## Flujo de datos de una corrida

1. Wrapper revisa `SCRAPER_ENABLED`, hace `git pull --ff-only`, arranca con `caffeinate`.
2. Por distrito y operación: probe → si hay demasiados resultados, bisecta por precio (`sort=low_price`).
3. Cada página: clasifica (ok / fin / bloqueo), parsea `__PRELOADED_STATE__` (fallback DOM).
4. Cards van a NDJSON incremental y se bufferizan por distrito.
5. Sanity gate por distrito → `ingestCards` (Property match, snapshot-on-change, qualityFlags).
6. `ScrapeRun` queda con conteos, errores, `gitSha`.

## UI: supuestos en la URL

```
/departamentos?inicial=20&tea=8&tcea=9&plazo=20
```

Cambiar un control recalcula cobertura, aporte y cuota en todas las filas y reordena el ranking. Los avisos del panel:

- Inicial &lt; 20%: bancos suelen pedir más en segunda vivienda.
- TCEA &lt; TEA: inconsistente (la TCEA incluye seguros).

## Qué no está en alcance

Multi-fuente (Nexo, Infocasas), geocodificación fina dentro de Surco/San Miguel, páginas de detalle masivas, modelado del tipo de cambio.
