import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConstructionPipeline } from './analytics';
import type { DistrictProps } from './district-map';
import { constructionFor, districtPanel } from './district-panel';
import type { DistrictMarket } from './market-dashboard';
import type { StratumRange } from './stats/strata';

const props = (p: Partial<DistrictProps>): DistrictProps =>
  ({
    slug: 'miraflores',
    name: 'Miraflores',
    tracked: true,
    zone: 'Lima Moderna (Ipsos)',
    zone_household_income_pen: null,
    high_income_pct: null,
    poverty_pct: null,
    complaints_per_10k: null,
    population: null,
    stratum_alto_pct: null,
    stratum_medio_alto_pct: null,
    stratum_medio_pct: null,
    stratum_medio_bajo_pct: null,
    stratum_bajo_pct: null,
    ...p,
  }) as DistrictProps;

const market = (m: Partial<DistrictMarket>): DistrictMarket => ({
  slug: 'miraflores',
  name: 'Miraflores',
  typicalSalePen: null,
  typicalRentPen: null,
  grossYieldPct: null,
  saleCount: 0,
  rentCount: 0,
  ...m,
});

const pipeline = (c: Partial<ConstructionPipeline>): ConstructionPipeline => ({
  districtSlug: 'miraflores',
  districtName: 'Miraflores',
  enPlanos: 0,
  enConstruccion: 0,
  entregaInmediata: 0,
  other: 0,
  total: 0,
  unitsApprox: 0,
  ...c,
});

const RANGES: StratumRange[] = [
  { stratum: 'alto', minPen: 2412.45, maxPen: null },
  { stratum: 'medio_alto', minPen: 1449.72, maxPen: 2412.44 },
  { stratum: 'medio', minPen: 1073.01, maxPen: 1449.71 },
  { stratum: 'medio_bajo', minPen: 863.72, maxPen: 1073.0 },
  { stratum: 'bajo', minPen: 0, maxPen: 863.71 },
];

const line = (p: ReturnType<typeof districtPanel>, label: string) => p.lines.find((l) => l.label === label)?.value;

test('full district', () => {
  const p = districtPanel(
    props({ population: 99000, stratum_alto_pct: 55, zone_household_income_pen: 12500, poverty_pct: 0.8, complaints_per_10k: 310.4 }),
    market({ typicalSalePen: 650000, typicalRentPen: 3200, grossYieldPct: 5.9, saleCount: 812 }),
    pipeline({ total: 42 }),
    RANGES,
  );
  assert.equal(p.title, 'Miraflores');
  assert.equal(p.zone, 'Lima Moderna (Ipsos)');
  assert.deepEqual(
    p.lines.map((l) => l.label),
    ['Población', 'Proyectos activos', 'Ingreso promedio del hogar (zona)', 'Pobreza monetaria', 'Denuncias por 10 mil habitantes'],
  );
  assert.equal(line(p, 'Población'), '99 mil');
  assert.equal(line(p, 'Proyectos activos'), '42');
  assert.equal(line(p, 'Ingreso promedio del hogar (zona)'), 'S/ 12,500 al mes');
  assert.equal(line(p, 'Pobreza monetaria'), '0.8 %');
  assert.deepEqual(
    p.market?.map((l) => [l.label, l.value]),
    [
      ['Avisos en venta', '812'],
      ['Precio típico', 'S/ 650,000'],
      ['Alquiler típico', 'S/ 3,200'],
      ['Rentabilidad bruta', '5.9 %'],
    ],
  );
  assert.deepEqual(p.strata.map((s) => s.label), ['Alto', 'Medio alto', 'Medio', 'Medio bajo', 'Bajo']);
  assert.equal(p.strata[0].pct, 55);
  assert.equal(p.strata[0].range, 'S/ 2,412 o más');
  assert.equal(p.strata[1].range, 'S/ 1,450 - 2,412');
  assert.equal(p.strata[4].range, 'hasta S/ 864');
  assert.match(p.sources, /INEI/);
});

test('a big population reads in millions', () => {
  assert.equal(line(districtPanel(props({ population: 1_038_495 }), undefined, undefined, RANGES), 'Población'), '1 M');
});

test('all missing', () => {
  const p = districtPanel(props({ zone: null }), undefined, undefined, []);
  assert.equal(p.market, null);
  assert.equal(p.zone, null);
  for (const l of p.lines) assert.equal(l.value, 'sin datos');
  assert.equal(p.strata.length, 5);
  for (const s of p.strata) {
    assert.equal(s.pct, null);
    assert.equal(s.range, 'sin datos');
  }
});

test('zero projects reads 0, not sin datos', () => {
  assert.equal(line(districtPanel(props({}), undefined, pipeline({ total: 0 }), []), 'Proyectos activos'), '0');
});

test('constructionFor gives 0 projects to a district with none, when the pipeline loaded', () => {
  const list = [pipeline({ districtSlug: 'lince', total: 3 })];
  assert.equal(constructionFor('lince', list)?.total, 3);
  assert.equal(constructionFor('miraflores', list)?.total, 0);
  assert.equal(constructionFor('miraflores', []), undefined);
});
