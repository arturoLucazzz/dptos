import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parseProperBuildId, parseProperImmediate, parseProperProject } from './parse';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const santaBeatriz = JSON.parse(fixture('santa-beatriz.json'));

describe('parseProperBuildId', () => {
  it('reads the build id from __NEXT_DATA__', () => {
    assert.equal(parseProperBuildId(fixture('propiedades.html')), 'oLU9Q1PZh6z-honuXcxPJ');
  });

  it('returns null without __NEXT_DATA__', () => {
    assert.equal(parseProperBuildId('<html></html>'), null);
  });
});

describe('parseProperProject', () => {
  it('parses the project and its units', () => {
    const cards = parseProperProject(santaBeatriz, 'santa-beatriz');
    const [project, ...units] = cards;
    assert.equal(units.length, 9);
    assert.equal(project.kind, 'PROJECT');
    assert.equal(project.source, 'proper');
    assert.equal(project.sourcePostingId, 'santa-beatriz');
    assert.equal(project.priceIsFrom, true);
    assert.equal(project.priceAmount, 280000);
    assert.equal(project.priceCurrency, 'PEN');
    assert.equal(project.buildingName, 'santa beatriz');
    assert.equal(project.areaMin, 34);
    assert.equal(project.areaMax, 62);
    assert.equal(project.bedroomsMin, 1);
    assert.equal(project.bedroomsMax, 2);
    assert.equal(project.unitsCount, 154);
    assert.equal(project.deliveryDate, '2027-03-31');
    assert.equal(project.developmentStage, 'construccion');
    // coordenada_A is the latitude (Lima is about -12)
    assert.equal(project.latitude, -12.072949);
    assert.equal(project.longitude, -77.030969);
    assert.equal(project.url, 'https://inversiones.proper.com.pe/proyecto/santa-beatriz');

    const unit = units[0];
    assert.equal(unit.kind, 'UNIT');
    assert.equal(unit.sourcePostingId, 'santa-beatriz-6024');
    assert.equal(unit.unitNumber, '202');
    assert.equal(unit.projectSourceId, 'santa-beatriz');
    assert.equal(unit.buildingName, 'santa beatriz');
    assert.equal(unit.priceAmount, 280000);
    assert.equal(unit.priceCurrency, 'PEN');
    assert.equal(unit.priceIsFrom, false);
    assert.equal(unit.areaTotal, 34);
    assert.equal(unit.bedrooms, 1);
    assert.equal(unit.bathrooms, 1);
    assert.equal(unit.url, 'https://inversiones.proper.com.pe/proyecto/santa-beatriz');
  });

  it('keeps the source estimate of rent and ROI in raw only', () => {
    const [, unit] = parseProperProject(santaBeatriz, 'santa-beatriz');
    assert.equal(unit.maintenanceAmount, null);
    assert.equal((unit.raw as { valor_alquiler: number }).valor_alquiler, 1500);
    assert.equal((unit.raw as { tir: number }).tir, 0.2169);
  });

  it('project card comes first', () => {
    const cards = parseProperProject(santaBeatriz, 'santa-beatriz');
    assert.equal(cards[0].kind, 'PROJECT');
    assert.ok(cards.slice(1).every((c) => c.kind === 'UNIT'));
  });

  it('skips units outside lima', () => {
    const cards = parseProperProject(santaBeatriz, 'santa-beatriz');
    assert.ok(cards.every((c) => c.districtSlug === null));
  });

  it('maps a Lima district on every card', () => {
    const lince = structuredClone(santaBeatriz);
    lince.pageProps.props.proyecto.distrito = 'lince';
    const cards = parseProperProject(lince, 'santa-beatriz');
    assert.ok(cards.every((c) => c.districtSlug === 'lince'));
  });

  it('prices a dollar unit in dollars', () => {
    const usd = structuredClone(santaBeatriz);
    const unit = usd.pageProps.props.departamentos[0];
    Object.assign(unit, { tipo_moneda: 'usd', precio: 665000, precio_dolar: 175000 });
    const [, parsed] = parseProperProject(usd, 'santa-beatriz');
    assert.equal(parsed.priceAmount, 175000);
    assert.equal(parsed.priceCurrency, 'USD');
  });

  it('gives no price for an unknown currency', () => {
    const eur = structuredClone(santaBeatriz);
    eur.pageProps.props.departamentos[0].tipo_moneda = 'eur';
    const [, parsed] = parseProperProject(eur, 'santa-beatriz');
    assert.equal(parsed.priceAmount, null);
    assert.equal(parsed.priceCurrency, null);
  });

  it('throws on a payload without a project', () => {
    assert.throws(() => parseProperProject({ pageProps: {} }, 'x'));
  });
});

describe('parseProperImmediate', () => {
  it('parses a single apartment as one unit without a project', () => {
    const cards = parseProperImmediate(JSON.parse(fixture('el-sol-1202.json')), 'el-sol-1202');
    assert.equal(cards.length, 1);
    const [unit] = cards;
    assert.equal(unit.kind, 'UNIT');
    assert.equal(unit.sourcePostingId, 'el-sol-1202');
    assert.equal(unit.projectSourceId, null);
    assert.equal(unit.buildingName, 'zoe urban');
    assert.equal(unit.priceAmount, 360500);
    assert.equal(unit.priceCurrency, 'PEN');
    assert.equal(unit.areaTotal, 40.18);
    assert.equal(unit.districtSlug, null);
    assert.equal(unit.latitude, -12.13879);
    assert.equal(unit.url, 'https://inversiones.proper.com.pe/entrega-inmediata/el-sol-1202');
  });
});
