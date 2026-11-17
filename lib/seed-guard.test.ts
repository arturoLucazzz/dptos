import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertSeedDatabase } from './seed-guard';

const url = (name: string) => `postgresql://arturoLucazzz@localhost:5432/${name}`;

describe('assertSeedDatabase', () => {
  it('accepts databases whose name ends in _seed or _dev', () => {
    assert.equal(assertSeedDatabase(url('dptos_seed')), 'dptos_seed');
    assert.equal(assertSeedDatabase(url('dptos_dev')), 'dptos_dev');
  });

  it('accepts a URL with a query string', () => {
    assert.equal(assertSeedDatabase(`${url('dptos_seed')}?schema=public`), 'dptos_seed');
  });

  for (const name of ['dptos', 'dptos_plan', 'seed_dptos']) {
    it(`refuses ${name} and names it`, () => {
      assert.throws(() => assertSeedDatabase(url(name)), (error: Error) => error.message.includes(`Base actual: ${name}`));
    });
  }

  it('refuses an empty or missing URL', () => {
    assert.throws(() => assertSeedDatabase(''), /_seed o _dev/);
    assert.throws(() => assertSeedDatabase(undefined), /_seed o _dev/);
  });
});
