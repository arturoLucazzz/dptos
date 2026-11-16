import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhotoUrls, rawFromFormEntries, validateManualListing } from './manual-listing';

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

const unit = { price: '280000', currency: 'USD', operation: 'SALE', district: 'Lince', bedrooms: '2', area: '65.5' };

describe('validateManualListing', () => {
  it('unit without link is valid', () => {
    const r = validateManualListing(unit, ids());
    assert.ok(r.ok);
    assert.equal(r.cards.length, 1);
    assert.equal(r.districtSlug, 'lince');
    assert.equal(r.operation, 'SALE');
    const [c] = r.cards;
    assert.equal(c.source, 'manual');
    assert.equal(c.sourcePostingId, 'm-id1');
    assert.equal(c.url, '');
    assert.equal(c.priceAmount, 280000);
    assert.equal(c.priceCurrency, 'USD');
    assert.equal(c.areaTotal, 65.5);
    assert.equal(c.kind, 'UNIT');
  });

  it('unit keeps the optional fields', () => {
    const r = validateManualListing(
      { ...unit, link: 'https://x.pe/a', address: 'Av. 1', buildingName: 'Torre', unitNumber: '502', publisher: 'Ana', bathrooms: '2', parkingSpots: '1', photoUrls: 'https://x/1.jpg\nnope, https://x/2.jpg', notes: 'luz' },
      ids()
    );
    assert.ok(r.ok);
    const [c] = r.cards;
    assert.equal(c.url, 'https://x.pe/a');
    assert.equal(c.publisherName, 'Ana');
    assert.equal(c.unitNumber, '502');
    assert.equal(c.bathrooms, 2);
    assert.equal(c.parkingSpots, 1);
    assert.deepEqual(c.imageUrls, ['https://x/1.jpg', 'https://x/2.jpg']);
    assert.equal(c.description, 'luz');
  });

  it('unit missing area is an error', () => {
    const r = validateManualListing({ ...unit, area: '' }, ids());
    assert.ok(!r.ok);
    assert.equal(r.errors.area, 'Requerido');
  });

  it('negative price is an error', () => {
    const r = validateManualListing({ ...unit, price: '-5' }, ids());
    assert.ok(!r.ok);
    assert.equal(r.errors.price, 'Debe ser un número mayor que 0');
  });

  it('prices in any thousands style are the same whole number', () => {
    for (const price of ['280000', '280,000', '280.000', '1 280 000', "1'280'000"]) {
      const r = validateManualListing({ ...unit, price }, ids());
      assert.ok(r.ok, price);
      assert.equal(r.cards[0].priceAmount, Number(price.replace(/[.,' ]/g, '')));
    }
  });

  it('a comma is a decimal separator for the area', () => {
    const r = validateManualListing({ ...unit, area: '65,5' }, ids());
    assert.ok(r.ok);
    assert.equal(r.cards[0].areaTotal, 65.5);
  });

  it('an ambiguous or non-numeric value gets a clear message', () => {
    const area = validateManualListing({ ...unit, area: '65.123' }, ids());
    assert.ok(!area.ok);
    assert.equal(area.errors.area, 'Escribe solo números, ej. 65.5');
    const price = validateManualListing({ ...unit, price: 'dos mil' }, ids());
    assert.ok(!price.ok);
    assert.equal(price.errors.price, 'Escribe solo números, ej. 280000');
    const zero = validateManualListing({ ...unit, price: '0' }, ids());
    assert.ok(!zero.ok);
    assert.equal(zero.errors.price, 'Debe ser un número mayor que 0');
  });

  it('values past the upper bounds are refused', () => {
    const r = validateManualListing({ ...unit, price: '10000000000', area: '100000', bedrooms: '100', bathrooms: '100', parkingSpots: '100' }, ids());
    assert.ok(!r.ok);
    for (const key of ['price', 'area', 'bedrooms', 'bathrooms', 'parkingSpots']) assert.equal(r.errors[key], 'Valor demasiado grande');
    assert.ok(validateManualListing({ ...unit, price: '9999999999', area: '99999', bedrooms: '99' }, ids()).ok);
  });

  it('a www link gets https', () => {
    const r = validateManualListing({ ...unit, link: 'www.x.pe/a' }, ids());
    assert.ok(r.ok);
    assert.equal(r.cards[0].url, 'https://www.x.pe/a');
  });

  it('raw keeps only known fields, capped', () => {
    const r = validateManualListing({ ...unit, evil: 'x', notes: 'a'.repeat(5000) }, ids());
    assert.ok(r.ok);
    const raw = r.cards[0].raw as Record<string, string>;
    assert.equal(raw.evil, undefined);
    assert.equal(raw.notes.length, 2000);
  });

  it('a studio has 0 bedrooms but a fraction does not', () => {
    assert.ok(validateManualListing({ ...unit, bedrooms: '0' }, ids()).ok);
    const r = validateManualListing({ ...unit, bedrooms: '1.5' }, ids());
    assert.ok(!r.ok);
    assert.ok(r.errors.bedrooms);
  });

  it('unknown district is an error', () => {
    const r = validateManualListing({ ...unit, district: 'Cercado de Lima' }, ids());
    assert.ok(!r.ok);
    assert.equal(r.errors.district, 'Distrito no válido');
  });

  it('a link that is not http is an error', () => {
    const r = validateManualListing({ ...unit, link: 'javascript:alert(1)' }, ids());
    assert.ok(!r.ok);
    assert.ok(r.errors.link);
  });

  const project = {
    project: { name: 'Torre Sol', district: 'Miraflores', developer: 'Inmob', stage: 'En construcción', deliveryDate: '2027-06' },
    units: [
      { price: '300000', currency: 'USD', bedrooms: '2', area: '70', unitNumber: '301' },
      { price: '350000', currency: 'USD', bedrooms: '3', area: '90' },
    ],
  };

  it('project gives project card then units', () => {
    const r = validateManualListing(project, ids());
    assert.ok(r.ok);
    assert.equal(r.operation, 'SALE');
    assert.equal(r.districtSlug, 'miraflores');
    assert.equal(r.cards.length, 3);
    assert.equal(r.cards[0].kind, 'PROJECT');
    assert.equal(r.cards[0].sourcePostingId, 'm-id1');
    assert.equal(r.cards[0].developerName, 'Inmob');
    for (const c of r.cards.slice(1)) {
      assert.equal(c.kind, 'UNIT');
      assert.equal(c.projectSourceId, 'm-id1');
      assert.equal(c.source, 'manual');
    }
    assert.equal(new Set(r.cards.map((c) => c.sourcePostingId)).size, 3);
  });

  it('project without units is an error', () => {
    const r = validateManualListing({ project: project.project, units: [] }, ids());
    assert.ok(!r.ok);
    assert.equal(r.errors.units, 'Agrega al menos una unidad');
  });

  it('blank unit rows are skipped and keep their index in errors', () => {
    const blank = { price: '', currency: '', bedrooms: '', area: '' };
    const ok = validateManualListing({ project: project.project, units: [project.units[0], blank, blank] }, ids());
    assert.ok(ok.ok);
    assert.equal(ok.cards.length, 2);
    const bad = validateManualListing({ project: project.project, units: [blank, { ...project.units[0], area: '' }] }, ids());
    assert.ok(!bad.ok);
    assert.equal(bad.errors['units.1.area'], 'Requerido');
  });

  it('only blank unit rows is no units', () => {
    const r = validateManualListing({ project: project.project, units: [{ price: '' }, {}] }, ids());
    assert.ok(!r.ok);
    assert.equal(r.errors.units, 'Agrega al menos una unidad');
  });

  it('project errors are keyed by field and unit', () => {
    const r = validateManualListing({ project: { name: '', district: 'Foo' }, units: [{ ...project.units[0], area: '' }] }, ids());
    assert.ok(!r.ok);
    assert.equal(r.errors['project.name'], 'Requerido');
    assert.equal(r.errors['project.district'], 'Distrito no válido');
    assert.equal(r.errors['units.0.area'], 'Requerido');
  });
});

describe('parsePhotoUrls', () => {
  it('splits on newlines and commas and drops non-http', () => {
    assert.deepEqual(parsePhotoUrls('https://a/1.jpg,\nftp://b/2.jpg\n  http://c/3.jpg  ,x'), ['https://a/1.jpg', 'http://c/3.jpg']);
  });
});

describe('rawFromFormEntries', () => {
  it('ignores unit indexes past the cap', () => {
    const raw = rawFromFormEntries([['mode', 'project'], ['units.0.price', '1'], ['units.5000.price', '2']]);
    assert.equal((raw.units as unknown[]).length, 1);
  });

  it('nests project and unit fields in project mode', () => {
    const raw = rawFromFormEntries([
      ['mode', 'project'],
      ['project.name', 'Torre'],
      ['units.0.price', '1'],
      ['units.1.price', '2'],
      ['district', 'ignored'],
    ]);
    assert.deepEqual(raw.project, { name: 'Torre' });
    assert.deepEqual(raw.units, [{ price: '1' }, { price: '2' }]);
  });

  it('stays flat in unit mode', () => {
    assert.deepEqual(rawFromFormEntries([['mode', 'unit'], ['price', '5']]), { mode: 'unit', price: '5' });
  });
});
