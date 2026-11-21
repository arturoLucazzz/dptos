import test from 'node:test';
import assert from 'node:assert/strict';
import { limaDay, newsEmptyText, orderNews, sourcePriorities, type NewsRow } from './news-order';

const row = (id: string, source: string, publishedAt: string | null, fetchedAt = '2026-11-20T12:00:00Z', saved = false): NewsRow => ({
  id, title: id, source, url: `https://x.pe/${id}`, publishedAt, fetchedAt, saved,
});
const prio = sourcePriorities([{ nombre: 'Gestión', url: 'https://g', prioridad: 1 }, { nombre: 'Andina', url: 'https://a', prioridad: 3 }]);

test('limaDay uses the Lima date, not UTC', () => {
  assert.equal(limaDay('2026-11-21T02:00:00Z'), '2026-11-20');
  assert.equal(limaDay('2026-11-20T06:00:00Z'), '2026-11-20');
});

test('newest day first, and the priority feed first within the same day', () => {
  const out = orderNews([
    row('a', 'Andina', '2026-11-20T20:00:00Z'),
    row('g', 'Gestión', '2026-11-20T10:00:00Z'),
    row('old', 'Gestión', '2026-11-19T20:00:00Z'),
  ], prio, 20);
  assert.deepEqual(out.map((r) => r.id), ['g', 'a', 'old']);
});

test('same day and same priority: newest time first; unknown source last', () => {
  const out = orderNews([
    row('u', 'Otro', '2026-11-20T20:00:00Z'),
    row('a1', 'Andina', '2026-11-20T10:00:00Z'),
    row('a2', 'Andina', '2026-11-20T15:00:00Z'),
  ], prio, 20);
  assert.deepEqual(out.map((r) => r.id), ['a2', 'a1', 'u']);
});

test('null publishedAt falls back to fetchedAt, and the list is cut to the limit', () => {
  const out = orderNews([row('n', 'Andina', null, '2026-11-20T15:00:00Z'), row('p', 'Andina', '2026-11-18T15:00:00Z')], prio, 1);
  assert.deepEqual(out.map((r) => r.id), ['n']);
});

test('empty text: no news at all, or no saved ones', () => {
  assert.equal(newsEmptyText('todas', 0), 'Todavía no hay noticias. Corre pnpm news:fetch.');
  assert.equal(newsEmptyText('guardadas', 0), 'Todavía no guardaste noticias.');
  assert.equal(newsEmptyText('guardadas', 3), null);
});
