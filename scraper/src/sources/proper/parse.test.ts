import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parseProperBuildId, parseProperImmediate, parseProperProfile } from './parse';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

describe('parseProperBuildId', () => {
  it('reads the build id from __NEXT_DATA__', () => {
    assert.equal(parseProperBuildId(fixture('propiedades.html')), 'oLU9Q1PZh6z-honuXcxPJ');
  });

  it('returns null without __NEXT_DATA__', () => {
    assert.equal(parseProperBuildId('<html></html>'), null);
  });
});

describe('parseProperProfile', () => {
  const profile = JSON.parse(fixture('orue-profile.json'));
  const gallery = JSON.parse(fixture('orue-gallery.json')) as { imagenes: string[] };

  it('gives exactly one PROJECT card with the profile facts', () => {
    const cards = parseProperProfile(profile, 'orue', gallery.imagenes);
    assert.equal(cards.length, 1);
    const [project] = cards;
    assert.equal(project.kind, 'PROJECT');
    assert.equal(project.source, 'proper');
    assert.equal(project.sourcePostingId, 'orue');
    assert.equal(project.priceIsFrom, true);
    assert.equal(project.priceAmount, 252296);
    assert.equal(project.priceCurrency, 'PEN');
    assert.equal(project.buildingName, 'orue');
    assert.equal(project.districtSlug, 'surquillo');
    assert.equal(project.areaMin, 34.24);
    assert.equal(project.areaMax, 57.72);
    assert.equal(project.bedroomsMin, 1);
    assert.equal(project.bedroomsMax, 2);
    assert.equal(project.unitsCount, 342);
    assert.equal(project.developmentStage, 'preventa');
    assert.equal(project.deliveryDate, '2028-12-31');
    assert.equal(project.latitude, -12.106769);
    assert.equal(project.longitude, -77.020887);
    assert.equal(project.url, 'https://inversiones.proper.com.pe/proyecto/orue');
    assert.deepEqual(project.imageUrls, gallery.imagenes);
    assert.equal(project.imageUrl, gallery.imagenes[0]);
  });

  it('still gives a card when the gallery failed (no images)', () => {
    const [project] = parseProperProfile(profile, 'orue', []);
    assert.equal(project.priceAmount, 252296);
    assert.deepEqual(project.imageUrls, []);
    assert.equal(project.imageUrl, null);
  });

  it('prices in the currency the list gives', () => {
    const [project] = parseProperProfile(profile, 'orue', [], 'usd');
    assert.equal(project.priceCurrency, 'USD');
    assert.equal(project.priceAmount, 252296);
  });

  it('throws when the answer has no proyecto', () => {
    assert.throws(() => parseProperProfile({}, 'x', []), /no proyecto in the answer/);
    assert.throws(() => parseProperProfile({ proyecto: null }, 'x', []), /no proyecto in the answer/);
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
    // El Sol is in Barranco, one of the tracked districts.
    assert.equal(unit.districtSlug, 'barranco');
    assert.equal(unit.latitude, -12.13879);
    assert.equal(unit.url, 'https://inversiones.proper.com.pe/entrega-inmediata/el-sol-1202');
  });
});
