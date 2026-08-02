import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumericInput, sanitizeNumericInput } from './numeric-input';

describe('sanitizeNumericInput', () => {
  it('strips leading zeros', () => {
    assert.equal(sanitizeNumericInput('020'), '20');
    assert.equal(sanitizeNumericInput('007'), '7');
    assert.equal(sanitizeNumericInput('0'), '0');
  });

  it('keeps empty and in-progress decimals', () => {
    assert.equal(sanitizeNumericInput(''), '');
    assert.equal(sanitizeNumericInput('0.'), '0.');
    assert.equal(sanitizeNumericInput('0.5'), '0.5');
  });

  it('can reject decimals', () => {
    assert.equal(sanitizeNumericInput('20.5', { allowDecimal: false }), '205');
  });
});

describe('parseNumericInput', () => {
  it('parses finite numbers and rejects incomplete drafts', () => {
    assert.equal(parseNumericInput('20'), 20);
    assert.equal(parseNumericInput(''), null);
    assert.equal(parseNumericInput('0.'), null);
  });
});
