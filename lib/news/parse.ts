/**
 * News headlines from RSS 2.0 and Atom feeds. Only the headline, source, date and link are
 * kept: article text and descriptions are never read into the result.
 */

import { XMLParser, XMLValidator } from 'fast-xml-parser';

export type FeedItem = { url: string; title: string; publishedAt: Date | null };
export type FeedDef = { nombre: string; url: string; prioridad: number };
export type NewsRow = { url: string; title: string; source: string; publishedAt: Date | null; fetchedAt: Date };
export type NewsDb = { insertMany(rows: NewsRow[]): Promise<number> };
export type FeedResult = { source: string; ok: boolean; found: number; kept: number; inserted: number; error?: string };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function cleanTitle(raw: unknown): string {
  const text = typeof raw === 'object' && raw !== null ? String((raw as Record<string, unknown>)['#text'] ?? '') : String(raw ?? '');
  return decodeEntities(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function textOf(v: unknown): string {
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  if (v && typeof v === 'object') return String((v as Record<string, unknown>)['#text'] ?? '').trim();
  return '';
}

function atomLink(link: unknown): string {
  const links = (Array.isArray(link) ? link : link === undefined ? [] : [link]) as (Record<string, string> | string)[];
  const pick = links.find((l) => typeof l === 'object' && (!l['@_rel'] || l['@_rel'] === 'alternate')) ?? links[0];
  if (typeof pick === 'string') return pick.trim();
  return (pick?.['@_href'] ?? '').trim();
}

function toDate(v: unknown): Date | null {
  const s = textOf(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parses an RSS 2.0 or Atom document. Throws on malformed XML or a document that is not a feed. */
export function parseFeed(xml: string, _source: string): FeedItem[] {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`XML inválido: ${valid.err.msg}`);
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', processEntities: true }).parse(xml);

  const out: FeedItem[] = [];
  if (doc.rss) {
    for (const it of asArray(doc.rss.channel?.item)) {
      const url = textOf(it.link);
      const title = cleanTitle(it.title);
      if (url && title) out.push({ url, title, publishedAt: toDate(it.pubDate ?? it['dc:date']) });
    }
  } else if (doc.feed) {
    for (const it of asArray(doc.feed.entry)) {
      const url = atomLink(it.link);
      const title = cleanTitle(it.title);
      if (url && title) out.push({ url, title, publishedAt: toDate(it.published ?? it.updated) });
    }
  } else {
    throw new Error('No es un feed RSS ni Atom');
  }
  return out;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** True when the title contains any keyword, ignoring case and accents. */
export function matchesKeywords(title: string, keywords: string[]): boolean {
  const t = fold(title);
  return keywords.some((k) => k && t.includes(fold(k)));
}

/** Fetches every feed, keeps headlines that match a keyword, and stores new URLs. One bad feed never stops the others. */
export async function fetchNews(deps: {
  feeds: FeedDef[];
  keywords: string[];
  fetch: (url: string) => Promise<string>;
  db: NewsDb;
  now: () => Date;
}): Promise<FeedResult[]> {
  const results: FeedResult[] = [];
  for (const feed of deps.feeds) {
    try {
      const items = parseFeed(await deps.fetch(feed.url), feed.nombre);
      const kept = items.filter((i) => matchesKeywords(i.title, deps.keywords));
      const fetchedAt = deps.now();
      const inserted = await deps.db.insertMany(kept.map((i) => ({ ...i, source: feed.nombre, fetchedAt })));
      results.push({ source: feed.nombre, ok: true, found: items.length, kept: kept.length, inserted });
    } catch (e) {
      results.push({ source: feed.nombre, ok: false, found: 0, kept: 0, inserted: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
