/**
 * Fetches the news feeds in data/market/feeds.csv and stores headlines that match
 * data/market/news-keywords.csv. Stores only headline, source, date and link.
 *
 *   pnpm news:fetch
 *
 * Prints one line per feed. Exits with code 1 when every feed failed.
 */

import { prisma } from '../lib/db';
import { loadFeeds, loadNewsKeywords } from '../lib/market-files';
import { fetchNews } from '../lib/news/parse';

const USER_AGENT = 'Mozilla/5.0 (compatible; dptos-news/1.0)';

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  // Hard limit for the whole run: a stalled DB connect or DNS lookup must not block the scrape.
  setTimeout(() => {
    console.error('news:fetch tardó más de 2 minutos; se detiene.');
    process.exit(1);
  }, 120_000).unref();
  const results = await fetchNews({
    feeds: loadFeeds(),
    keywords: loadNewsKeywords(),
    fetch: fetchText,
    now: () => new Date(),
    db: {
      async insertMany(rows) {
        const r = await prisma.newsItem.createMany({ data: rows, skipDuplicates: true });
        return r.count;
      },
    },
  });
  for (const r of results) {
    console.log(
      r.ok
        ? `${r.source}: ${r.found} titulares, ${r.kept} con palabras clave, ${r.inserted} nuevos`
        : `${r.source}: FALLÓ (${r.error})`,
    );
  }
  await prisma.$disconnect();
  if (results.length > 0 && results.every((r) => !r.ok)) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
