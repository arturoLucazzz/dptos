import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parseNexoListPage } from './parse';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

describe('parseNexoListPage', () => {
  it('parses 24 cards on page 1', () => {
    const { cards } = parseNexoListPage(fixture('p1.html'));
    assert.equal(cards.length, 24);
    const [luna] = cards;
    assert.equal(luna.kind, 'PROJECT');
    assert.equal(luna.source, 'nexo');
    assert.equal(luna.sourcePostingId, '3503-luna');
    assert.equal(luna.url, 'https://nexoinmobiliario.pe/departamentos/jesus-maria/luna-3503');
    assert.equal(luna.buildingName, 'LUNA');
    assert.equal(luna.districtSlug, 'jesus-maria');
    assert.equal(luna.priceAmount, 534000);
    assert.equal(luna.priceCurrency, 'PEN');
    assert.equal(luna.priceIsFrom, true);
    assert.equal(luna.areaMin, 54);
    assert.equal(luna.areaMax, 87.34);
    assert.equal(luna.bedroomsMin, 2);
    assert.equal(luna.bedroomsMax, 3);
    assert.equal(luna.unitsCount, 58);
    assert.equal(luna.developmentStage, 'En construcción');
    assert.ok(cards.every((c) => c.kind === 'PROJECT' && c.priceIsFrom && c.sourcePostingId));
    // 19 in the tracked districts before Barranco joined them, plus one in Barranco.
    assert.equal(cards.filter((c) => c.districtSlug).length, 20);
    assert.equal(cards.filter((c) => c.districtSlug === 'barranco').length, 1);
  });

  it('reads developer and address', () => {
    const { cards } = parseNexoListPage(fixture('p1.html'));
    const brisana = cards.find((c) => c.buildingName === 'Albamar | Brisana');
    assert.equal(brisana?.developerName, 'ALBAMAR GRUPO INMOBILIARIO');
    assert.equal(brisana?.address, 'Av. Chorrillos 396, chorrillos');
    // Chorrillos is not one of the tracked Lima districts.
    assert.equal(brisana?.districtName, 'Chorrillos');
    assert.equal(brisana?.districtSlug, null);
  });

  it('finds the next page', () => {
    assert.equal(parseNexoListPage(fixture('p1.html')).nextPageUrl, 'https://nexoinmobiliario.pe/departamentos?page=2');
    const two = parseNexoListPage(fixture('p2.html'));
    assert.equal(two.cards.length, 24);
    assert.equal(two.nextPageUrl, 'https://nexoinmobiliario.pe/departamentos?page=3');
  });

  it('has no next page after the last one', () => {
    const last = fixture('p2.html').replace('let currentPage = 2;', 'let currentPage = 33;');
    assert.equal(parseNexoListPage(last).nextPageUrl, null);
  });

  it('keeps a project without a known currency but drops its price', () => {
    const html = fixture('p1.html').replace(/"coin":"S\\\/\."/, '"coin":"?"');
    const [first] = parseNexoListPage(html).cards;
    assert.equal(first.priceAmount, null);
    assert.equal(first.priceCurrency, null);
  });

  it('throws on a page without the project array', () => {
    assert.throws(() => parseNexoListPage('<html></html>'), /no embedded projects/);
  });

  it('throws when the paging markers are missing', () => {
    const html = fixture('p1.html').replace('const itemsPerPage', 'const perPage');
    assert.throws(() => parseNexoListPage(html), /no paging markers/);
  });
});
