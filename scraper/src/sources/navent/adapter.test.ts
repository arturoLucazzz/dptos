import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Operation } from '@/lib/generated/prisma/enums';
import { emptyCard } from '@/lib/listing-card';
import type { BrowserSession } from '../../utils/browser-fetch';
import type { SourceAdapter, SourceBatch } from '../types';
import { isShortfall, naventAdapter, type NaventAdapterDeps } from './adapter';

const ZONE: Record<string, { label: string; min: string }> = {
  lince: { label: 'Lince', min: '119493' },
  'san-isidro': { label: 'San Isidro', min: '119502' },
};

function searchPage(districtSlug: string): string {
  const zone = ZONE[districtSlug];
  const state = JSON.stringify({
    listStore: { appliedFilters: [{ type: 'location', options: [{ ...zone, type: 'zone' }] }] },
  });
  return `<script id="preloadedData">window.__PRELOADED_STATE__ = ${state};</script>`;
}

/** A postings page holding these ids. */
function postingsPage(ids: string[], total: number, totalPages: number): unknown {
  return {
    paging: { total, totalPages },
    listPostings: ids.map((postingId) => ({
      postingId,
      url: `/propiedades/clasificado/x-${postingId}.html`,
      priceOperationTypes: [
        { operationType: { name: 'Venta' }, prices: [{ currencyId: '6', amount: 300000, currency: 'S/' }] },
      ],
    })),
  };
}

type PostHandler = (zone: string, page: number) => unknown;

function fakeSession(onPost: PostHandler, calls: string[] = []): BrowserSession {
  return {
    fetchJson: async () => {
      throw new Error('not used');
    },
    async open(url) {
      calls.push(`open ${url}`);
      const slug = Object.keys(ZONE).find((s) => url.includes(s));
      return { status: 200, html: slug ? searchPage(slug) : '<html></html>' };
    },
    async postJson<T>(_url: string, body: unknown): Promise<T> {
      const { zone, pagina } = body as { zone: string; pagina: number };
      calls.push(`post ${zone} p${pagina}`);
      return onPost(zone, pagina) as T;
    },
    async close() {
      calls.push('close');
    },
  };
}

function deps(over: Partial<NaventAdapterDeps>): Partial<NaventAdapterDeps> {
  return {
    wait: async () => {},
    retries: 0,
    log: () => {},
    htmlCrawl: async () => {
      throw new Error('the HTML crawler should not run');
    },
    ...over,
  };
}

async function crawl(adapter: SourceAdapter, districts: string[]) {
  const batches: SourceBatch[] = [];
  const result = await adapter.crawl({
    districts,
    operation: Operation.SALE,
    onBatch: async (b) => {
      batches.push(b);
    },
  });
  const ids = batches.flatMap((b) => b.cards.map((c) => c.sourcePostingId));
  return { result, batches, ids };
}

describe('isShortfall', () => {
  it('needs both more than 2% and more than 30 postings missing', () => {
    assert.equal(isShortfall(2459, 2509), false); // 50 missing, under 2%
    assert.equal(isShortfall(2450, 2509), true); // 59 missing, over 2%
    assert.equal(isShortfall(275, 302), false); // 27 missing, under 30
    assert.equal(isShortfall(270, 302), true); // 32 missing
    assert.equal(isShortfall(0, null), false);
  });
});

describe('naventAdapter', () => {
  it('pages until the page count the API reports', async () => {
    const calls: string[] = [];
    const session = fakeSession(
      (_zone, page) => postingsPage(page === 1 ? ['1', '2'] : ['3'], 3, 2),
      calls
    );
    const adapter = naventAdapter('adondevivir', deps({ createSession: async () => session }));
    const { result, ids, batches } = await crawl(adapter, ['lince']);

    assert.deepEqual(ids, ['1', '2', '3']);
    assert.ok(batches.every((b) => b.districtSlug === 'lince' && b.cards.every((c) => c.source === 'adondevivir')));
    assert.deepEqual(calls, [
      'open https://www.adondevivir.com/departamentos-en-venta-en-lince.html',
      'post 119493 p1',
      'post 119493 p2',
      'close',
    ]);
    assert.deepEqual(result, {
      districts: [{ districtSlug: 'lince', pagesFetched: 3, blocked: false, errors: [], claimedTotal: 3 }],
      skippedOutsideLima: 0,
      incomplete: false,
    });
  });

  it('keeps the cards of a failed adondevivir district and flags the crawl incomplete', async () => {
    const session = fakeSession((_zone, page) => {
      if (page === 2) throw new Error('POST answered 500');
      return postingsPage(['1'], 2, 2);
    });
    const adapter = naventAdapter('adondevivir', deps({ createSession: async () => session }));
    const { result, ids } = await crawl(adapter, ['lince']);

    assert.deepEqual(ids, ['1']);
    assert.equal(result.incomplete, true);
    assert.equal(result.districts.length, 1);
    assert.match(result.districts[0].errors[0], /lince page 2: POST answered 500/);
  });

  it('fails a district whose page comes back empty before the last page', async () => {
    const session = fakeSession((_zone, page) => postingsPage(page === 1 ? ['1'] : [], 2, 2));
    const adapter = naventAdapter('adondevivir', deps({ createSession: async () => session }));
    const { result, ids } = await crawl(adapter, ['lince']);

    assert.deepEqual(ids, ['1']);
    assert.equal(result.incomplete, true);
    assert.match(result.districts[0].errors[0], /lince page 2 of 2 came back empty/);
  });

  it('falls back to HTML when an urbania page comes back empty before the last page', async () => {
    const session = fakeSession((_zone, page) => postingsPage(page === 1 ? ['1'] : [], 2, 2));
    let htmlRan = false;
    const htmlCrawl: SourceAdapter['crawl'] = async () => {
      htmlRan = true;
      return {
        districts: [{ districtSlug: 'lince', pagesFetched: 2, blocked: false, errors: [], claimedTotal: 2 }],
        skippedOutsideLima: 0,
        incomplete: false,
      };
    };
    const adapter = naventAdapter('urbania', deps({ createSession: async () => session, htmlCrawl }));
    const { result } = await crawl(adapter, ['lince']);
    assert.equal(htmlRan, true);
    assert.equal(result.incomplete, false);
  });

  it('fails a district whose first page has no page count', async () => {
    const adapter = naventAdapter(
      'adondevivir',
      deps({
        createSession: async () =>
          fakeSession(() => {
            const page = postingsPage(['1'], 50, 2) as { paging: Record<string, unknown> };
            delete page.paging.totalPages;
            return page;
          }),
      })
    );
    const { result } = await crawl(adapter, ['lince']);
    assert.equal(result.incomplete, true);
    assert.match(result.districts[0].errors[0], /no page count/);
  });

  it('accepts a district the site says is empty', async () => {
    const adapter = naventAdapter(
      'adondevivir',
      deps({ createSession: async () => fakeSession(() => postingsPage([], 0, 0)) })
    );
    const { result, ids } = await crawl(adapter, ['lince']);
    assert.deepEqual(ids, []);
    assert.equal(result.incomplete, false);
    assert.deepEqual(result.districts[0].errors, []);
  });

  it('flags the crawl incomplete when every page came back but far fewer postings than claimed', async () => {
    const ids50 = Array.from({ length: 50 }, (_, i) => String(i + 1));
    const adapter = naventAdapter(
      'adondevivir',
      deps({ createSession: async () => fakeSession(() => postingsPage(ids50, 100, 1)) })
    );
    const { result, ids } = await crawl(adapter, ['lince']);
    assert.equal(ids.length, 50);
    assert.equal(result.incomplete, true);
    assert.equal(result.districts.length, 1);
    assert.match(result.districts[0].errors[0], /50 postings collected, 100 claimed/);
  });

  it('falls back to the HTML crawler for an urbania district, without handing a card over twice', async () => {
    const session = fakeSession((_zone, page) => {
      if (page === 2) throw new Error('POST answered 403');
      return postingsPage(['1', '2'], 3, 2);
    });
    const htmlCalls: string[][] = [];
    const htmlCrawl: SourceAdapter['crawl'] = async ({ districts, onBatch }) => {
      htmlCalls.push(districts);
      await onBatch({
        districtSlug: 'lince',
        cards: ['1', '2', '3'].map((id) => emptyCard('urbania', { sourcePostingId: id })),
      });
      return {
        districts: [{ districtSlug: 'lince', pagesFetched: 4, blocked: false, errors: [], claimedTotal: 3 }],
        skippedOutsideLima: 0,
        incomplete: false,
      };
    };
    const adapter = naventAdapter('urbania', deps({ createSession: async () => session, htmlCrawl }));
    const { result, ids } = await crawl(adapter, ['lince']);

    assert.deepEqual(htmlCalls, [['lince']]);
    assert.deepEqual(ids, ['1', '2', '3']);
    assert.equal(result.incomplete, false);
    assert.equal(result.districts.length, 1);
    assert.equal(result.districts[0].pagesFetched, 2 + 4);
    assert.equal(result.districts[0].claimedTotal, 3);
    assert.match(result.districts[0].errors[0], /^JSON path: lince page 2/);
  });

  it('crawls urbania with the HTML crawler when the browser session will not start', async () => {
    let htmlDistricts: string[] = [];
    const htmlCrawl: SourceAdapter['crawl'] = async ({ districts }) => {
      htmlDistricts = districts;
      return { districts: [], skippedOutsideLima: 0, incomplete: true };
    };
    const adapter = naventAdapter(
      'urbania',
      deps({
        createSession: async () => {
          throw new Error('403');
        },
        htmlCrawl,
      })
    );
    const { result } = await crawl(adapter, ['lince', 'san-isidro']);
    assert.deepEqual(htmlDistricts, ['lince', 'san-isidro']);
    assert.equal(result.incomplete, true);
  });

  it('keeps the finished districts and flags the crawl incomplete when the browser dies', async () => {
    const session = fakeSession((zone) => {
      if (zone === ZONE['san-isidro'].min) throw new Error('Target page, context or browser has been closed');
      return postingsPage(['1'], 1, 1);
    });
    const adapter = naventAdapter('adondevivir', deps({ createSession: async () => session }));
    const { result } = await crawl(adapter, ['lince', 'san-isidro']);

    assert.equal(result.incomplete, true);
    assert.deepEqual(
      result.districts.map((d) => d.districtSlug),
      ['lince']
    );
    assert.match(result.districts[0].errors[0], /crawl stopped early at san-isidro/);
  });

  it('fails the source when the browser dies before any district finished', async () => {
    const session = fakeSession(() => {
      throw new Error('Target page, context or browser has been closed');
    });
    const adapter = naventAdapter('adondevivir', deps({ createSession: async () => session }));
    await assert.rejects(crawl(adapter, ['lince']), /has been closed/);
  });
});

describe('naventAdapter maxPages', () => {
  it('fetches only the first results page when capped at 1, without an error', async () => {
    const calls: string[] = [];
    const session = fakeSession((_zone, page) => postingsPage([`p${page}a`, `p${page}b`], 6, 3), calls);
    const adapter = naventAdapter('urbania', deps({ createSession: async () => session }));
    const batches: SourceBatch[] = [];
    const result = await adapter.crawl({
      districts: ['lince'],
      operation: Operation.SALE,
      maxPages: 1,
      onBatch: async (b) => void batches.push(b),
    });
    assert.deepEqual(calls.filter((c) => c.startsWith('post')), ['post 119493 p1']);
    assert.equal(result.incomplete, false);
    assert.deepEqual(result.districts[0]!.errors, []);
    assert.equal(batches.flatMap((b) => b.cards).length, 2);
  });
});

describe('naventAdapter maxPages without a fallback', () => {
  it('fails the district instead of running the uncapped HTML crawler when the JSON path breaks', async () => {
    const session = fakeSession(() => ({ nothing: true }));
    const adapter = naventAdapter('urbania', deps({ createSession: async () => session }));
    const result = await adapter.crawl({ districts: ['lince'], operation: Operation.SALE, maxPages: 1, onBatch: async () => {} });
    assert.equal(result.incomplete, true);
    assert.ok(result.districts[0]!.errors.length > 0);
  });

  it('throws instead of crawling HTML when the browser session cannot start', async () => {
    const adapter = naventAdapter('urbania', deps({ createSession: async () => { throw new Error('no browser'); } }));
    await assert.rejects(
      adapter.crawl({ districts: ['lince'], operation: Operation.SALE, maxPages: 1, onBatch: async () => {} }),
      /no browser/
    );
  });
});
