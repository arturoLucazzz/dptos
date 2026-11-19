import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUnique, parseIndicators, parsePlaces, parseStatFile } from './files';

const ctx = { indicators: new Set(['high_income_pct', 'poverty_pct']), places: new Set(['lince', 'san-isidro', 'apeim-zona-7']) };
const H = 'place,indicator,value,period,source,source_ref';

test('parseStatFile reads rows and keeps the file name', () => {
  const rows = parseStatFile('a.csv', `${H}\nlince,high_income_pct,19.9,2020,"INEI, Planos 2020",p. 32\n`, ctx);
  assert.deepEqual(rows, [
    { place: 'lince', indicator: 'high_income_pct', value: 19.9, period: '2020', source: 'INEI, Planos 2020', sourceRef: 'p. 32', file: 'a.csv' },
  ]);
});

test('a BOM, CRLF line ends, and trailing blank lines load the same', () => {
  const rows = parseStatFile('a.csv', `﻿${H}\r\nlince,high_income_pct,19.9,2020,INEI,p. 32\r\n\r\n\r\n`, ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, 19.9);
});

test('a wrong header names the file and the expected header', () => {
  assert.throws(() => parseStatFile('a.csv', 'place,value\n', ctx), { message: `Encabezado inválido en a.csv. Debe ser: ${H}` });
});

test('unknown place, unknown indicator, empty source, and bad numbers name file and row', () => {
  assert.throws(() => parseStatFile('a.csv', `${H}\ncallao,high_income_pct,1,2020,INEI,p\n`, ctx), {
    message: 'Lugar desconocido en a.csv, fila 2: callao',
  });
  assert.throws(() => parseStatFile('a.csv', `${H}\nlince,age_median,1,2020,INEI,p\n`, ctx), {
    message: 'Indicador desconocido en a.csv, fila 2: age_median (agrégalo a indicators.csv)',
  });
  assert.throws(() => parseStatFile('a.csv', `${H}\nlince,high_income_pct,1,2020,,p\n`, ctx), { message: 'Falta la fuente en a.csv, fila 2' });
  assert.throws(() => parseStatFile('a.csv', `${H}\nlince,high_income_pct,"2,412",2020,INEI,p\n`, ctx), {
    message: 'Número inválido en a.csv, fila 2: 2,412 (usa punto decimal y sin separador de miles)',
  });
  assert.throws(() => parseStatFile('a.csv', `${H}\nlince,high_income_pct,,2020,INEI,p\n`, ctx), {
    message: 'Número inválido en a.csv, fila 2:  (usa punto decimal y sin separador de miles)',
  });
});

test('checkUnique names both files for a repeated place, indicator, and period', () => {
  const a = parseStatFile('a.csv', `${H}\nlince,high_income_pct,19.9,2020,INEI,p\n`, ctx);
  const b = parseStatFile('b.csv', `${H}\nlince,high_income_pct,20,2020,INEI,p\n`, ctx);
  assert.throws(() => checkUnique([...a, ...b]), { message: 'Dato repetido: lince, high_income_pct, 2020 en a.csv y b.csv' });
});

test('parsePlaces splits districts and rejects a non-Lima district', () => {
  const text = 'place,kind,label,districts\napeim-zona-7,zone,Zona 7 (APEIM),miraflores;san-isidro\n';
  assert.deepEqual(parsePlaces(text)[0].districts, ['miraflores', 'san-isidro']);
  assert.throws(() => parsePlaces('place,kind,label,districts\nz,zone,Z,callao\n'), {
    message: 'Distrito desconocido en places.csv, fila 2: callao',
  });
});

test('parseIndicators reads the catalog', () => {
  const [d] = parseIndicators('indicator,label,unit,description\npoverty_pct,Pobreza,%,"Pobreza monetaria total, INEI"\n');
  assert.deepEqual(d, { indicator: 'poverty_pct', label: 'Pobreza', unit: '%', description: 'Pobreza monetaria total, INEI' });
});
