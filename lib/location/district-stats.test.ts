import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDistrictStatsCsv } from './district-stats';
import { LIMA_DISTRICT_SLUGS } from '../../scraper/src/config/districts';

const HEADER = 'slug,income_per_capita_pen,income_source,income_date,complaints_per_10k,complaints_source,complaints_date';

test('parseDistrictStatsCsv reads numbers and empty cells as null', () => {
  const rows = parseDistrictStatsCsv(`${HEADER}\nlince,2100.5,INEI 2020,2020,,,\nsan-isidro,,,,120.3,SIDPOL,2026-01\n`);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    slug: 'lince',
    incomePerCapitaPen: 2100.5,
    incomeSource: 'INEI 2020',
    incomeDate: '2020',
    complaintsPer10k: null,
    complaintsSource: null,
    complaintsDate: null,
  });
  assert.equal(rows[1].incomePerCapitaPen, null);
  assert.equal(rows[1].complaintsPer10k, 120.3);
});

test('parseDistrictStatsCsv reads quoted cells with commas', () => {
  const rows = parseDistrictStatsCsv(`${HEADER}\nlince,2100,"INEI, Planos estratificados",2020,,,\n`);
  assert.equal(rows[0].incomeSource, 'INEI, Planos estratificados');
});

test('parseDistrictStatsCsv throws on an unknown slug', () => {
  assert.throws(() => parseDistrictStatsCsv(`${HEADER}\ncallao,1,,,,,\n`), {
    message: 'Distrito desconocido en district-stats.csv: callao',
  });
});

test('parseDistrictStatsCsv throws on a non-numeric number', () => {
  assert.throws(() => parseDistrictStatsCsv(`${HEADER}\nlince,abc,,,,,\n`), {
    message: 'Número inválido en district-stats.csv, fila 2: abc',
  });
});

test('parseDistrictStatsCsv throws on a wrong header', () => {
  assert.throws(() => parseDistrictStatsCsv('slug,income\nlince,1\n'), /encabezado/);
});

test('the committed district-stats.csv parses and covers the 11 scraped districts', () => {
  const text = readFileSync(join(process.cwd(), 'data/location/district-stats.csv'), 'utf8');
  const slugs = new Set(parseDistrictStatsCsv(text).map((r) => r.slug));
  for (const slug of LIMA_DISTRICT_SLUGS) assert.ok(slugs.has(slug), slug);
});
