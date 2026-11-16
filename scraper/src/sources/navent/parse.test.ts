import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseNaventPostings } from './parse';

const FIXTURES = path.join(__dirname, '__fixtures__');

function fixture(name: string): { listPostings: unknown[]; paging: { total: number; totalPages: number } } {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));
}

const urbaniaJson = fixture('urbania-lince-p1.response.json');
const adondevivirJson = fixture('adondevivir-lince-p1.response.json');

describe('parseNaventPostings', () => {
  it('parses the urbania page', () => {
    const page = parseNaventPostings(urbaniaJson, 'https://urbania.pe', 'urbania', 'lince');
    assert.equal(page.cards.length, urbaniaJson.listPostings.length);
    assert.equal(page.totalResults, urbaniaJson.paging.total);
    assert.equal(page.totalPages, urbaniaJson.paging.totalPages);

    const first = page.cards[0];
    assert.ok(first.sourcePostingId);
    assert.equal(typeof first.priceAmount, 'number');
    assert.equal(first.source, 'urbania');
    assert.equal(first.districtSlug, 'lince');
    assert.ok(first.url.startsWith('https://urbania.pe/'));
  });

  it('parses the adondevivir page', () => {
    const page = parseNaventPostings(adondevivirJson, 'https://www.adondevivir.com', 'adondevivir', 'lince');
    assert.equal(page.cards.length, adondevivirJson.listPostings.length);
    assert.equal(page.totalResults, adondevivirJson.paging.total);
    assert.equal(page.totalPages, adondevivirJson.paging.totalPages);

    const first = page.cards[0];
    assert.ok(first.sourcePostingId);
    assert.equal(typeof first.priceAmount, 'number');
    assert.equal(first.source, 'adondevivir');
    assert.ok(first.url.startsWith('https://www.adondevivir.com/'));
  });

  it('finds a copy on both sites', () => {
    const urbania = parseNaventPostings(urbaniaJson, 'https://urbania.pe', 'urbania', 'lince').cards;
    const adondevivir = parseNaventPostings(adondevivirJson, 'https://www.adondevivir.com', 'adondevivir', 'lince').cards;

    // The recon pair: the "Vizuale 5" project at Av. Prol. Iquitos 1766, desde S/ 289,777.
    const onUrbania = urbania.find((card) => card.sourcePostingId === '151013036');
    const onAdondevivir = adondevivir.find((card) => card.sourcePostingId === '151013410');
    assert.ok(onUrbania && onAdondevivir);
    assert.equal(onUrbania.title, onAdondevivir.title);
    assert.equal(onUrbania.address, onAdondevivir.address);
    assert.match(onUrbania.address ?? '', /Av\. Prol\. Iquitos 1766/);
    assert.equal(onUrbania.priceAmount, 289777);
    assert.equal(onAdondevivir.priceAmount, 289777);
    assert.equal(onUrbania.kind, 'PROJECT');
    assert.equal(onAdondevivir.kind, 'PROJECT');
  });

  it('returns no cards for a body that is not a postings page', () => {
    assert.deepEqual(parseNaventPostings({ error: 'nope' }, 'https://urbania.pe', 'urbania', 'lince'), {
      cards: [],
      totalResults: null,
      totalPages: null,
    });
  });
});
