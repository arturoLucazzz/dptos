import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PANEL, financeFrom, fixedFromDefaults } from '../lib/assumption-defaults';
import { monthlyCosts, purchaseCosts } from '../lib/costs';
import { listingFinance } from '../lib/finance';
import type { ListingCard } from '../lib/listing-card';
import { validateManualListing } from '../lib/manual-listing';
import { buildInvestorCases, type InvestorCase } from './seed-cases';
import { DISTRICTS } from './seed-districts';
import { seedPlaces, seedZoneShapes } from './seed-location';
import { scoreAll, type ScoreSubject } from '../lib/location/score';
import type { RentPoint } from '../lib/location/local-rent';

const IDS = [
  'ganga-lince',
  'trampa-barata',
  'copia-mas-barata',
  'vendedor-apurado',
  'proper-roi-distinto',
  'en-planos',
  'aviso-facebook',
  'pierde-plata',
  'lince-junto-a-san-isidro',
  'lince-lejos',
  'alquiler-local-alto',
];

const cases = buildInvestorCases();
const byId = (id: string): InvestorCase => cases.find((c) => c.id === id)!;

/** The app's numbers for one card, with the given cash and the seeded district rent. */
function financeOf(card: ListingCard, cashAvailablePen = 80_000) {
  const fixed = fixedFromDefaults();
  const district = DISTRICTS.find((d) => d.slug === card.districtSlug)!;
  const pricePen = card.priceAmount!;
  const areaM2 = card.areaTotal!;
  return listingFinance({
    pricePen,
    grossRentPen: district.rentPerM2 * areaM2,
    monthlyCostsPen: monthlyCosts({
      pricePen,
      areaM2,
      districtSlug: district.slug,
      publishedMaintenancePen: card.maintenanceAmount,
      assumptions: fixed,
    }).totalPen,
    purchaseCostsPen: purchaseCosts({ pricePen, isFirstSaleFromDeveloper: false, assumptions: fixed }).totalPen,
    assumptions: financeFrom({ ...DEFAULT_PANEL, cashAvailablePen }, fixed),
  });
}

describe('buildInvestorCases', () => {
  it('has the 11 cases, each once', () => {
    assert.deepEqual(cases.map((c) => c.id).sort(), [...IDS].sort());
  });

  it('gives every case something to ingest, a screen, and Spanish copy', () => {
    for (const c of cases) {
      assert.ok(c.cards.length > 0 || c.manual !== undefined, c.id);
      assert.match(c.screen, /^\//, c.id);
      assert.ok(c.title.length > 0 && c.lookFor.length > 0, c.id);
    }
  });

  it('makes the bargain pay for itself with S/ 200k cash, and not with S/ 80k', () => {
    const card = byId('ganga-lince').cards[0]!;
    assert.ok(financeOf(card, 200_000).monthlyGainPen > 0);
    assert.ok(financeOf(card, 80_000).monthlyGainPen < 0);
  });

  it('keeps the bargain above the junk floor of its district (about S/ 4,950 per m² in Lince)', () => {
    const card = byId('ganga-lince').cards[0]!;
    assert.ok(card.priceAmount! / card.areaTotal! > 5_000);
  });

  it('makes the trap and the money pit cost money every month, even with S/ 200k', () => {
    for (const cash of [80_000, 200_000]) {
      assert.ok(financeOf(byId('trampa-barata').cards[0]!, cash).monthlyGainPen < 0);
      const pit = financeOf(byId('pierde-plata').cards[0]!, cash);
      assert.ok(pit.monthlyGainPen < 0);
      assert.equal(pit.crossoverYear, null);
    }
  });

  it('puts one apartment on 3 sources, S/ 20k apart', () => {
    const cards = byId('copia-mas-barata').cards;
    assert.deepEqual(new Set(cards.map((c) => c.source)), new Set(['urbania', 'adondevivir', 'proper']));
    const prices = cards.map((c) => c.priceAmount!);
    assert.equal(Math.max(...prices) - Math.min(...prices), 20_000);
  });

  it('cuts the hurried seller three times, ending at the card price', () => {
    const c = byId('vendedor-apurado');
    assert.equal(c.priceHistory!.length, 4);
    assert.equal(c.priceHistory!.at(-1), c.cards[0]!.priceAmount);
    for (let i = 1; i < 4; i++) assert.ok(c.priceHistory![i]! < c.priceHistory![i - 1]!);
  });

  it('gives the manual Facebook ad an input the form validation accepts', () => {
    const result = validateManualListing(byId('aviso-facebook').manual, () => 'seed');
    assert.equal(result.ok, true);
  });

  it('keeps the project under construction at a "desde" price', () => {
    const card = byId('en-planos').cards[0]!;
    assert.equal(card.kind, 'PROJECT');
    assert.equal(card.priceIsFrom, true);
  });
});

describe('location cases', () => {
  const saleSubject = (id: string): ScoreSubject => {
    const card = byId(id).cards.find((c) => c.operation === 'SALE')!;
    return { propertyId: id, districtSlug: card.districtSlug!, lat: card.latitude, lon: card.longitude, bedrooms: card.bedrooms };
  };
  const rents: RentPoint[] = byId('alquiler-local-alto')
    .cards.filter((c) => c.operation === 'RENT')
    .map((c) => ({ lat: c.latitude!, lon: c.longitude!, perM2: c.priceAmount! / c.areaTotal!, bedrooms: c.bedrooms }));
  const results = scoreAll({
    subjects: ['lince-junto-a-san-isidro', 'lince-lejos', 'alquiler-local-alto'].map(saleSubject),
    places: seedPlaces(),
    zones: seedZoneShapes(),
    districtStats: [],
    rentActivity: [],
    rents,
  });
  const result = (id: string) => results.find((r) => r.propertyId === id)!;

  it('the location cases score as their titles say', () => {
    const near = result('lince-junto-a-san-isidro');
    const far = result('lince-lejos');
    assert.equal(near.status, 'OK');
    assert.ok(near.score! > far.score!, `${near.score} vs ${far.score}`);
    assert.ok(near.reasons.some((r) => r.text.startsWith('Cerca de San Isidro (tu zona, 9/10)')), JSON.stringify(near.reasons));
    assert.ok(!far.reasons.some((r) => r.text.includes('tu zona')), JSON.stringify(far.reasons));
  });

  it('the local-rent case gets a local rent above its district median', () => {
    const local = result('alquiler-local-alto').localRent;
    const miraflores = DISTRICTS.find((d) => d.slug === 'miraflores')!;
    assert.ok(local, 'no local rent');
    assert.ok(local.n >= 8);
    assert.ok(local.middlePerM2 > miraflores.rentPerM2 * 1.15, `${local.middlePerM2}`);
  });

  it('the seed boundaries and zones make San Isidro a district zone and Parque Castilla a 400 m point', () => {
    const zones = seedZoneShapes();
    assert.equal(zones.find((z) => z.name === 'San Isidro')?.kind, 'DISTRICT');
    const castilla = zones.find((z) => z.name === 'Parque Castilla');
    assert.ok(castilla?.kind === 'CIRCLE' && castilla.radiusM === 400 && castilla.rating === 9);
  });
});
