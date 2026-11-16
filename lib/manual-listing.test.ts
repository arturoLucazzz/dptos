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

  it('thousands separators are rejected, not guessed', () => {
    const r = validateManualListing({ ...unit, price: '280,000' }, ids());
    assert.ok(!r.ok);
    assert.equal(r.errors.price, 'Debe ser un número mayor que 0');
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
