import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { districtName } from './district-name';

describe('districtName', () => {
  it('uses the Spanish name with its accents', () => {
    assert.equal(districtName('jesus-maria'), 'Jesús María');
  });
  it('keeps "de" in lowercase', () => {
    assert.equal(districtName('santiago-de-surco'), 'Santiago de Surco');
  });
  it('falls back to a Spanish title case for an unknown slug', () => {
    assert.equal(districtName('villa-el-salvador'), 'Villa el Salvador');
    assert.equal(districtName('santa-maria-del-triunfo'), 'Santa Maria del Triunfo');
    assert.equal(districtName('la-molina'), 'La Molina');
    assert.equal(districtName('la-victoria'), 'La Victoria');
  });
});
