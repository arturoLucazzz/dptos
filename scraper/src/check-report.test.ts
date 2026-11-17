import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyCard } from '@/lib/listing-card';
import { checkSource, fillRates } from './check-report';

const card = (over: Parameters<typeof emptyCard>[1]) => emptyCard('urbania', { sourcePostingId: 'x', ...over });
const full = { price: 0.9, area: 0.9, bedrooms: 0.9, address: 0.9, coordinates: 0.9 };

describe('fillRates', () => {
  it('counts the share of cards that carry each field', () => {
    const rates = fillRates([
      card({ priceAmount: 1, areaTotal: 50 }),
      card({ priceAmount: 1 }),
      card({ priceAmount: 1, latitude: -12, longitude: -77 }),
      card({}),
    ]);
    assert.equal(rates.price, 0.75);
    assert.equal(rates.area, 0.25);
    assert.equal(rates.coordinates, 0.25);
  });
});

describe('checkSource', () => {
  it('fails with no cards', () => {
    const result = checkSource({ cards: [], baseline: full });
    assert.equal(result.pass, false);
    assert.ok(result.reasons.includes('0 avisos'));
  });

  it('fails when a field drops more than 20 points below the fixture', () => {
    const cards = Array.from({ length: 10 }, (_, i) =>
      card({ priceAmount: 1, areaTotal: i < 6 ? 50 : null, bedrooms: 2, address: 'x', latitude: -12, longitude: -77 })
    );
    const result = checkSource({ cards, baseline: full });
    assert.equal(result.pass, false);
    assert.ok(result.reasons.includes('área: 60% vs 90%'), result.reasons.join(' | '));
  });

  it('passes a drop of 15 points', () => {
    const cards = Array.from({ length: 4 }, (_, i) =>
      card({ priceAmount: 1, areaTotal: i < 3 ? 50 : null, bedrooms: 2, address: 'x', latitude: -12, longitude: -77 })
    );
    assert.equal(checkSource({ cards, baseline: full }).pass, true);
  });
});
