# dptos

## Nuestro mantra

Esta plataforma está hecha para inversionistas. Quien entra quiere saber qué departamento le da el mayor valor posible por su dinero: el mejor ROI.

Para responder eso, la plataforma hace los números de cada departamento: la cuota mensual de la hipoteca, los intereses, la cuota inicial, el alquiler esperado, los costos y el ROI en %. Proper ya muestra un ROI por departamento, y nosotros lo calculamos para todos.

Cada pantalla, filtro y dato tiene que ayudar a un inversionista a decidir. Mostrar datos no basta. Antes de agregar algo, pregunta: ¿esto ayuda a encontrar el mejor ROI?

Más adelante, un chat con IA podrá responder preguntas sobre todos estos datos.

## Qué hace

Herramienta para analizar departamentos en venta en Lima: lee varias fuentes (Urbania, Adondevivir, Proper, Nexo y avisos agregados a mano), une las copias de un mismo departamento, guarda solo lo observado en Postgres, y calcula en el cliente cobertura de cuota, precio justo y probabilidad de rebaja.

## Arquitectura

```
Urbania · Adondevivir · Proper · Nexo · /agregar
    │
    ▼
scraper/  (adaptadores por fuente; Playwright headed donde hace falta) ──NDJSON──► data/runs/
    │
    ▼ ingest
Postgres (Prisma)
    │
    ├── ScrapeRun          historial y salud de cada corrida
    ├── Posting            identidad del aviso (fuente + id de la fuente)
    ├── PostingSnapshot    precio/features solo cuando cambian
    ├── Property           departamento físico (agrupa reposts y copias entre fuentes)
    ├── Project            proyecto inmobiliario (unidades y precios "desde")
    ├── DuplicateDecision  lo que decidiste en la revisión de duplicados
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

Por eso el panel de supuestos (inicial, TEA, TCEA, plazo) vive en el query string y recalcula la tabla en el cliente: los controles del panel se envían a `/api/departamentos` (con la URL como estado) y el servidor devuelve las filas ya calculadas.

### Identidad

| Concepto | Qué es | Clave |
|---|---|---|
| **Posting** | Un aviso de una fuente | `(source, sourcePostingId, operation)` |
| **Property** | El departamento físico | fingerprint + match conservador |
| **Snapshot** | Una observación del aviso | solo si cambió un campo trackeado |

El matcher de properties es deliberadamente estricto: exige dirección normalizada **con número**, área ±2 m² y precio ±5%. Sub-mergear deja duplicados visibles; sobre-mergear destruye observaciones en silencio.

Entre fuentes rige lo mismo (ver [Duplicados entre fuentes](#duplicados-entre-fuentes)): ante la duda se marca, no se une.

### Modelos en memoria (no columnas)

- **Precio justo** (`lib/fair-price.ts`): regresión log-log sobre ventas `UNIT` vivas. Cache invalidada cuando termina una corrida.
- **Alquiler estimado** (`lib/rent.ts`): mediana S//m² por distrito × dormitorios. Solo usa alquileres observados; las estimaciones de alquiler o ROI que publica Proper no entran al índice.
- **Edad del aviso** (`lib/posting-age.ts`): cuando falta `firstDateOnline`, se estima con id→fecha (ids de Urbania son aproximadamente secuenciales).
- **Costos y finanzas** (`lib/costs.ts`, `lib/finance.ts`): funciones puras; corren en el navegador.

### Compuerta de sanidad

Es por fuente, distrito y operación. Si una porción trae &lt;20% de lo que trajo la corrida anterior de esa fuente (`SANITY_GATE_RATIO`), **no** se toca `lastSeenAt`: evita que un parser roto marque Lima entera como vendida.

- Si la misma porción cae 3 corridas seguidas con algo observado (&gt; 0), la caída se acepta como real. Cero nunca se acepta solo: una fuente bloqueada no debe marcar todo como vendido.
- Proper y Nexo traen todo el sitio en cada corrida, así que su compuerta compara el **total** de la fuente contra su total anterior, con la misma regla (20%, 3 corridas, cero nunca). Que un distrito suyo quede en cero es un proyecto vendido, no un parser roto, y no frena nada. Para aceptar a mano: `--accept-gate=proper:all`.
- `--accept-gate=fuente:distrito` acepta la caída en esa corrida (se repite o va separado por comas).
- Una fuente se anota en la corrida (`ScrapeRun.sources`) solo si terminó de recorrer completo y no quedó frenada por la compuerta. Eso alimenta "posiblemente vendido" por fuente: una corrida que no recorrió una fuente no dice nada de sus avisos.

## Fuentes

| Fuente | Cómo se lee | Notas |
|---|---|---|
| Urbania | JSON del endpoint de Navent dentro de una sesión de navegador headed; si falla, vuelve al crawler HTML | Unidades con precio |
| Adondevivir | Igual que Urbania (mismo backend Navent) | Muchos avisos son copia de Urbania; se unen solos |
| Proper | JSON público | Precios por unidad. Las estimaciones de alquiler y ROI de Proper no se usan. Los departamentos de "entrega inmediata" son ventas con inquilino |
| Nexo | Páginas HTML de la lista, con fetch simple | Solo proyectos, con precios "desde"; no hay precio por unidad. Rechaza un User-Agent de navegador, así que se pide sin él |
| Manual | `/agregar` | Modo unidad y modo proyecto. Un aviso manual solo sale al marcarlo "vendido o retirado" |
| Remax | **pendiente** | Ver abajo |

El proyecto no intenta pasar controles anti-bot. Solo se leen distritos de la app: los 11 de `LIMA_DISTRICT_SLUGS` (Lince, Jesús María, San Isidro, Pueblo Libre, Magdalena, Surquillo, Miraflores, San Borja, Santiago de Surco, San Miguel, Barranco). Los avisos de otros distritos (Chorrillos, ...) cuentan como fuera y no se guardan. `pnpm scrape --districts=...` rechaza cualquier slug que no esté en esa lista (por ejemplo `magdalena-del-mar`; el slug es `magdalena`).

### Remax (pendiente)

La búsqueda está detrás de Cloudflare Turnstile, que nunca se resuelve para el navegador automatizado (en un Chrome normal sí). No se intenta saltar el control. Patrón de la búsqueda, para cuando haya otra vía:

```
https://www.remax.pe/web/search/all/propertys/list/?type__in=departament&contract__type=sale|rent&departament__in=15&province__in=128&district__in=<id>&page=N
```

| Distrito | id | Distrito | id |
|---|---|---|---|
| jesus-maria | 1289 | san-borja | 1306 |
| lince | 1292 | san-isidro | 1307 |
| magdalena | 1296 | san-miguel | 1312 |
| miraflores | 1298 | santiago-de-surco | 1316 |
| pueblo-libre | 1297 | surquillo | 1317 |

Mientras tanto, los avisos de Remax entran por `/agregar`.

## Duplicados entre fuentes

La unión vive en `lib/dedupe.ts`. Un merge equivocado saca un aviso real de todas las estadísticas, así que solo se une automáticamente lo que otro departamento no puede compartir.

| Nivel | Qué pasa | Cuándo |
|---|---|---|
| HIGH | Se une solo | Copia entre portales Navent (mismo título, precio, área ±0.5 m² y dirección); misma puerta según el matcher estricto (dirección con número, área ±2 m², precio ±5%, y si ambos tienen coordenadas, a menos de 150 m) con ambas áreas y precios conocidos, mismos números en la dirección y sin dirección de tipo "al NNN" o cuadra; mismo edificio y mismo número de unidad con dormitorios, área y precio compatibles |
| MEDIUM | Se marca para revisar | Mismo edificio o desarrolladora, mismos dormitorios, área ±2 m², precio ±10% y, si ambos tienen coordenadas, a menos de 150 m |
| LOW | Se marca para revisar | Misma calle, mismos dormitorios, área ±5 m² y precio ±10% |

En la tabla de departamentos, los posibles duplicados se revisan con "es el mismo" o "no es el mismo". Un par rechazado no se vuelve a marcar. "No es el mismo" sobre una copia ya unida deshace un merge equivocado. Las decisiones quedan en `DuplicateDecision`; `scripts/export-duplicate-decisions.ts` las escribe en `lib/__fixtures__/duplicate-decisions.json`, y el test de dedupe reporta dónde las reglas discrepan de ellas.

Precio oficial de un departamento = la copia viva más barata. Las filas con varias copias muestran "{n} fuentes · S/ ...k a S/ ...k", y las estadísticas cuentan cada propiedad una sola vez.

## Estructura

```
app/                  Next.js (App Router)
  departamentos/      ranking por cobertura + panel de supuestos
  estadisticas/       precios (vivos vs salidas), inventario, pipeline
  alertas/            bajadas y nuevos con cobertura alta (24h)
  favoritos/          Property.favorite (sobrevive a reposts)
  agregar/            alta manual de unidades y proyectos
  runs/               salud de ScrapeRun, una tabla por fuente
lib/                  dominio compartido (app + scraper)
  finance.ts          cuota, cobertura, año de cruce
  fair-price.ts       regresión de precio justo
  fingerprint.ts      agrupación en Property
  dedupe.ts           reglas de unión entre fuentes (HIGH/MEDIUM/LOW)
  sanity-gate.ts      compuerta de sanidad por fuente
  listings.ts         proyección delgada para la UI
  analytics.ts        índices y pipeline
  alerts.ts           cambios recientes
scraper/              worker de scraping
  src/sources/        un adaptador por fuente (navent, proper, nexo) y registro
  src/scrapers/urbania/ crawler HTML de respaldo (__PRELOADED_STATE__ + DOM)
  src/db/ingest.ts    escritura a Prisma + sanity gate
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

## Actualizar una base existente

Para una base que ya tiene datos de antes de las varias fuentes. Correr en este orden:

```bash
# 1. Respaldo. Nada de lo que sigue borra avisos, pero un respaldo es barato.
pg_dump --format=custom --file=dptos-$(date +%Y%m%d).dump "$DATABASE_URL"

# 2. Migraciones. `migrate deploy` solo aplica las que faltan; no uses `pnpm db:migrate`
#    (es `migrate dev`, que puede pedir resetear la base).
pnpm prisma migrate deploy
pnpm db:generate

# 3. Claves nuevas de Property (calle sin número) para los avisos viejos.
pnpm backfill:property-keys

# 4. Proyectos para los avisos de proyecto que no tienen uno. Primero sin --apply para ver cuántos.
pnpm backfill:projects
pnpm backfill:projects --apply

# 5. Avisos viejos guardados como magdalena-del-mar pasan a magdalena. Primero sin --apply.
pnpm relabel:districts
pnpm relabel:districts --apply
```

**Nunca** corras `pnpm replay --reset` sobre la base real: borra todas las propiedades, y con ellas los favoritos, descartes y notas.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | App en http://localhost:3000 |
| `pnpm scrape` | Scrapea y escribe a Postgres + NDJSON |
| `pnpm scrape --districts=lince --operations=sale,rent` | Un subconjunto |
| `pnpm scrape --sources=urbania,proper` | Solo esas fuentes (por defecto, todas las registradas) |
| `pnpm scrape --accept-gate=urbania:lince` | Acepta una caída de la compuerta en esa corrida |
| `pnpm scrape:probe` | Reporte de calidad de parseo (no escribe) |
| `pnpm replay --reset data/runs/*.ndjson` | Re-ingesta sin red. `--reset` borra propiedades, favoritos y notas: solo en una base de prueba |
| `pnpm backfill:projects [--apply]` | Liga avisos de proyecto sin proyecto (sin `--apply` solo muestra cuántos) |
| `pnpm relabel:districts [--apply]` | Pasa filas de `magdalena-del-mar` a `magdalena` (sin `--apply` solo muestra cuántas) |
| `pnpm db:seed:market -- --weeks=8 --reset` | Mercado sintético (~10k ventas + 5k alquileres, 10 distritos) |
| `pnpm test` | Tests del dominio y del scraper |
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

Urbania y Adondevivir bloquean Chromium headless (403). El scraper corre **headed** por defecto. Ver `.env.example` para `SCRAPER_HEADLESS`, canales de Playwright, etc.

## Flujo de datos de una corrida

0. Se eligen las fuentes (`--sources`, por defecto todas) y se recorren una por una.
1. Wrapper revisa `SCRAPER_ENABLED`, hace `git pull --ff-only`, arranca con `caffeinate`.
2. Por distrito y operación: probe → si hay demasiados resultados, bisecta por precio (`sort=low_price`).
3. Cada página: clasifica (ok / fin / bloqueo) y parsea según la fuente (JSON, o `__PRELOADED_STATE__` y DOM en el respaldo de Urbania).
4. Cards van a NDJSON incremental y se bufferizan por distrito.
5. Sanity gate por fuente y distrito → `ingestCards` (Property match, unión entre fuentes, snapshot-on-change, qualityFlags).
6. `ScrapeRun` queda con conteos por fuente, fuentes registradas, errores (incluye por qué una fuente no se registró) y `gitSha`. `/runs` muestra una tabla por fuente.

## UI: supuestos en la URL

```
/departamentos?inicial=20&tea=8&tcea=9&plazo=20
```

Cambiar un control recalcula cobertura, aporte y cuota en todas las filas y reordena el ranking. Los avisos del panel:

- Inicial &lt; 20%: bancos suelen pedir más en segunda vivienda.
- TCEA &lt; TEA: inconsistente (la TCEA incluye seguros).

## Qué no está en alcance

Geocodificación fina dentro de Surco/San Miguel, páginas de detalle masivas, modelado del tipo de cambio.
