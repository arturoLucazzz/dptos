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
} from './market-files';

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
  assert.deepEqual(loadFeeds().map((f) => f.nombre), ['Gestión', 'El Comercio', 'Andina']);
  assert.ok(loadNewsKeywords().includes('techo propio'));
});
