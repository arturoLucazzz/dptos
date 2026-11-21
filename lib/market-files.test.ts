import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEstudios,
  parseVoces,
  parseFeeds,
  parseNewsKeywords,
  loadEstudios,
  loadVoces,
  loadFeeds,
  loadNewsKeywords,
  tryLoad,
} from './market-files';
import { matchesKeywords } from './news/parse';

const EH = 'titulo,autor,url,frecuencia,precios_de_aviso,nota';
const VH = 'nombre,plataforma,url,tema,vende_asesoria,revisado';

test('parseEstudios reads valid rows, with quoted commas', () => {
  const rows = parseEstudios(`${EH}\nÍndice,Urbania,https://urbania.pe/x,mensual,si,"Precios, de aviso"\n`);
  assert.deepEqual(rows, [
    { titulo: 'Índice', autor: 'Urbania', url: 'https://urbania.pe/x', frecuencia: 'mensual', preciosDeAviso: true, nota: 'Precios, de aviso' },
  ]);
});

test('parseEstudios rejects a wrong header, naming the file', () => {
  assert.throws(() => parseEstudios('a,b\n'), /estudios\.csv/);
});

test('parseEstudios rejects a non-https URL, naming the row', () => {
  assert.throws(() => parseEstudios(`${EH}\nA,B,http://x.pe,m,si,n\n`), /estudios\.csv, fila 2.*https/);
});

test('parseEstudios rejects a bad flag, naming the row', () => {
  assert.throws(() => parseEstudios(`${EH}\nA,B,https://x.pe,m,tal vez,n\n`), /estudios\.csv, fila 2.*si.*no/);
});

test('parseEstudios rejects a wrong cell count and an empty required field', () => {
  assert.throws(() => parseEstudios(`${EH}\nA,B,https://x.pe,m,si\n`), /estudios\.csv, fila 2.*5 columnas/);
  assert.throws(() => parseEstudios(`${EH}\nA,B,https://x.pe,m,si,n\nA,,https://x.pe,m,si,n\n`), /estudios\.csv, fila 3.*autor/);
});

test('parseVoces reads rows and filters by revisado', () => {
  const text = `${VH}\nAna,YouTube,https://youtube.com/@ana,inversión,si,si\nLuis,Blog,https://luis.pe,alquiler,no,no\n`;
  assert.equal(parseVoces(text, { onlyReviewed: false }).length, 2);
  const reviewed = parseVoces(text, { onlyReviewed: true });
  assert.deepEqual(reviewed, [
    { nombre: 'Ana', plataforma: 'YouTube', url: 'https://youtube.com/@ana', tema: 'inversión', vendeAsesoria: true, revisado: true },
  ]);
});

test('parseVoces rejects bad URL, bad flag, missing field, naming the row', () => {
  assert.throws(() => parseVoces(`${VH}\nAna,YT,ftp://x,t,si,no\n`, { onlyReviewed: false }), /voces\.csv, fila 2.*https/);
  assert.throws(() => parseVoces(`${VH}\nAna,YT,https://x.pe,t,si,quizá\n`, { onlyReviewed: false }), /voces\.csv, fila 2.*revisado/);
  assert.throws(() => parseVoces(`${VH}\nAna,YT,https://x.pe,,si,no\n`, { onlyReviewed: false }), /voces\.csv, fila 2.*tema/);
  assert.throws(() => parseVoces(`${VH}\nAna,YT,https://x.pe,t,si\n`, { onlyReviewed: false }), /voces\.csv, fila 2.*columnas/);
});

test('parseFeeds sorts by priority and rejects bad rows', () => {
  const feeds = parseFeeds('nombre,url,prioridad\nB,https://b.pe/rss,2\nA,https://a.pe/rss,1\n');
  assert.deepEqual(feeds.map((f) => f.nombre), ['A', 'B']);
  assert.throws(() => parseFeeds('nombre,url,prioridad\nA,https://a.pe,x\n'), /feeds\.csv, fila 2.*prioridad/);
  assert.throws(() => parseFeeds('nombre,url,prioridad\nA,http://a.pe,1\n'), /feeds\.csv, fila 2.*https/);
  assert.throws(() => parseFeeds('nombre,url\n'), /feeds\.csv/);
});

test('parseNewsKeywords reads lowercase keywords and rejects bad rows', () => {
  assert.deepEqual(parseNewsKeywords('palabra\ninmobiliari\nconstrucción\n'), ['inmobiliari', 'construcción']);
  assert.throws(() => parseNewsKeywords('palabra\nVivienda\n'), /news-keywords\.csv, fila 2.*minúscula/);
  assert.throws(() => parseNewsKeywords('palabra\na,b\n'), /news-keywords\.csv, fila 2.*columnas/);
  assert.throws(() => parseNewsKeywords('x\na\n'), /news-keywords\.csv/);
});

test('the committed market files parse', () => {
  assert.ok(loadEstudios().length >= 3);
  assert.ok(loadVoces({ onlyReviewed: false }).length >= 8);
  assert.ok(loadVoces({ onlyReviewed: false }).every((v) => !v.revisado));
  assert.deepEqual(loadFeeds().map((f) => f.nombre), ['Gestión', 'Gestión Economía', 'Gestión Tu Dinero', 'El Comercio', 'El Comercio Economía', 'Andina']);
  assert.ok(loadNewsKeywords().includes('techo propio'));
});

test('flags accept an accented sí', () => {
  const rows = parseEstudios(`${EH}\nÍndice,Urbania,https://urbania.pe/x,mensual,sí,nota\n`);
  assert.equal(rows[0].preciosDeAviso, true);
});

test('error row numbers count real file lines, blank lines included', () => {
  const text = `${EH}\nA,B,https://a.pe/x,mensual,si,n\n\n\nC,D,http://bad.pe,mensual,si,n\n`;
  assert.throws(() => parseEstudios(text), /fila 5/);
});

test('tryLoad returns data, or the Spanish message when the loader throws', () => {
  assert.deepEqual(tryLoad(() => [1]), { ok: true, data: [1] });
  assert.deepEqual(tryLoad(() => { throw new Error('Fila inválida en x.csv, fila 3'); }), { ok: false, message: 'Fila inválida en x.csv, fila 3' });
});

test('committed keywords keep market headlines and drop off-topic ones', () => {
  const kw = loadNewsKeywords();
  const drop = [
    'Ministerio de Vivienda culmina construcción de cámaras de bombeo para prevenir aniegos',
    'Temblor en Junín: reportan daños en viviendas, caída de rocas y corte de energía',
    'BCRP emite moneda sobre bicentenario del Colegio Nacional de San Carlos de Puno',
    'Elecciones en el departamento de Cusco',
  ];
  const keep = [
    'Créditos hipotecarios crecen 8% en octubre',
    'Precio de vivienda en Lima sube en el tercer trimestre',
    'Mercado inmobiliario: ventas de departamentos caen en Lima',
    'BCRP mantiene la tasa de referencia en 4.25%',
    'Precios de alquiler suben en Lima Moderna',
  ];
  for (const t of drop) assert.equal(matchesKeywords(t, kw), false, t);
  for (const t of keep) assert.equal(matchesKeywords(t, kw), true, t);
});
