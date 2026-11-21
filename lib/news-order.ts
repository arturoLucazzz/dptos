/** Pure helpers for the news section: ordering and empty-state texts. No database here. */

import type { Feed } from './market-files';

export type NewsRow = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  fetchedAt: string;
  saved: boolean;
};

const LIMA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The calendar day (YYYY-MM-DD) of an instant in Lima. */
export function limaDay(iso: string): string {
  return LIMA.format(new Date(iso));
}

export function sourcePriorities(feeds: Feed[]): Map<string, number> {
  return new Map(feeds.map((f) => [f.nombre, f.prioridad]));
}

/** Newest Lima day first; within a day the feed with priority 1 first, then newest time. Cut to `limit`. */
export function orderNews(rows: NewsRow[], priorities: Map<string, number>, limit: number): NewsRow[] {
  const when = (r: NewsRow) => r.publishedAt ?? r.fetchedAt;
  const prio = (r: NewsRow) => priorities.get(r.source) ?? Number.MAX_SAFE_INTEGER;
  return [...rows]
    .sort((a, b) => {
      const da = limaDay(when(a));
      const db = limaDay(when(b));
      if (da !== db) return da < db ? 1 : -1;
      if (prio(a) !== prio(b)) return prio(a) - prio(b);
      return Date.parse(when(b)) - Date.parse(when(a));
    })
    .slice(0, limit);
}

/** The text to show when a tab has nothing, or null when it has items. */
export function newsEmptyText(tab: 'todas' | 'guardadas', count: number): string | null {
  if (count > 0) return null;
  return tab === 'todas' ? 'Todavía no hay noticias. Corre pnpm news:fetch.' : 'Todavía no guardaste noticias.';
}
