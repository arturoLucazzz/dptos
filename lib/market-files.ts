/**
 * Reads and checks the editable files in data/market/: studies, voices, news feeds,
 * and news keywords. Each file has a pure parseX(text) and a loadX() that reads the file.
 * A bad file throws a Spanish error that names the file and the row.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { splitCsvLine } from './stats/csv';

export const ESTUDIOS_HEADER = 'titulo,autor,url,frecuencia,precios_de_aviso,nota';
export const VOCES_HEADER = 'nombre,plataforma,url,tema,vende_asesoria,revisado';
export const FEEDS_HEADER = 'nombre,url,prioridad';
export const KEYWORDS_HEADER = 'palabra';

export type Estudio = { titulo: string; autor: string; url: string; frecuencia: string; preciosDeAviso: boolean; nota: string };
export type Voz = { nombre: string; plataforma: string; url: string; tema: string; vendeAsesoria: boolean; revisado: boolean };
export type Feed = { nombre: string; url: string; prioridad: number };

/** Data rows with their file row number (the header is row 1). Throws on a wrong header or cell count. */
function rowsOf(file: string, text: string, header: string): { cells: string[]; row: number }[] {
  // Row numbers count real file lines (blank lines too), so the owner can find the row.
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((line, i) => ({ line, row: i + 1 }));
  const nonBlank = lines.filter((l) => l.line.trim() !== '');
  if (nonBlank[0]?.line.trim() !== header) throw new Error(`Encabezado inválido en ${file}. Debe ser: ${header}`);
  const n = header.split(',').length;
  return nonBlank.slice(1).map(({ line, row }) => {
    const cells = splitCsvLine(line);
    if (cells.length !== n) {
      throw new Error(`Fila inválida en ${file}, fila ${row}: tiene ${cells.length} columnas y deben ser ${n}. ¿Una coma sin comillas?`);
    }
    return { cells, row };
  });
}

function required(file: string, row: number, field: string, value: string): string {
  if (!value) throw new Error(`Falta un valor en ${file}, fila ${row}: ${field}`);
  return value;
}

function httpsUrl(file: string, row: number, value: string): string {
  required(file, row, 'url', value);
  let ok = false;
  try {
    ok = new URL(value).protocol === 'https:' && value.startsWith('https://');
  } catch {
    ok = false;
  }
  if (!ok) throw new Error(`URL inválida en ${file}, fila ${row}: ${value} (debe empezar con https://)`);
  return value;
}

function flag(file: string, row: number, field: string, value: string): boolean {
  const v = value === 'sí' ? 'si' : value;
  if (v !== 'si' && v !== 'no') throw new Error(`Valor inválido en ${file}, fila ${row}: ${field} debe ser si o no (dice "${value}")`);
  return v === 'si';
}

export function parseEstudios(text: string): Estudio[] {
  const f = 'estudios.csv';
  return rowsOf(f, text, ESTUDIOS_HEADER).map(({ cells: [titulo, autor, url, frecuencia, aviso, nota], row }) => ({
    titulo: required(f, row, 'titulo', titulo),
    autor: required(f, row, 'autor', autor),
    url: httpsUrl(f, row, url),
    frecuencia: required(f, row, 'frecuencia', frecuencia),
    preciosDeAviso: flag(f, row, 'precios_de_aviso', aviso),
    nota: required(f, row, 'nota', nota),
  }));
}

export function parseVoces(text: string, opts: { onlyReviewed: boolean }): Voz[] {
  const f = 'voces.csv';
  const voces = rowsOf(f, text, VOCES_HEADER).map(({ cells: [nombre, plataforma, url, tema, vende, revisado], row }) => ({
    nombre: required(f, row, 'nombre', nombre),
    plataforma: required(f, row, 'plataforma', plataforma),
    url: httpsUrl(f, row, url),
    tema: required(f, row, 'tema', tema),
    vendeAsesoria: flag(f, row, 'vende_asesoria', vende),
    revisado: flag(f, row, 'revisado', revisado),
  }));
  return opts.onlyReviewed ? voces.filter((v) => v.revisado) : voces;
}

/** Feeds in priority order, 1 first. */
export function parseFeeds(text: string): Feed[] {
  const f = 'feeds.csv';
  return rowsOf(f, text, FEEDS_HEADER)
    .map(({ cells: [nombre, url, prioridad], row }) => {
      if (!/^\d+$/.test(prioridad)) throw new Error(`Valor inválido en ${f}, fila ${row}: prioridad debe ser un número entero (dice "${prioridad}")`);
      return { nombre: required(f, row, 'nombre', nombre), url: httpsUrl(f, row, url), prioridad: Number(prioridad) };
    })
    .sort((a, b) => a.prioridad - b.prioridad);
}

export function parseNewsKeywords(text: string): string[] {
  const f = 'news-keywords.csv';
  return rowsOf(f, text, KEYWORDS_HEADER).map(({ cells: [palabra], row }) => {
    required(f, row, 'palabra', palabra);
    if (palabra !== palabra.toLowerCase()) throw new Error(`Palabra inválida en ${f}, fila ${row}: ${palabra} (debe estar en minúscula)`);
    return palabra;
  });
}

const MARKET_DIR = path.join(process.cwd(), 'data', 'market');
const read = (file: string) => readFileSync(path.join(MARKET_DIR, file), 'utf8');

export const loadEstudios = (): Estudio[] => parseEstudios(read('estudios.csv'));
export const loadVoces = (opts: { onlyReviewed: boolean }): Voz[] => parseVoces(read('voces.csv'), opts);
export const loadFeeds = (): Feed[] => parseFeeds(read('feeds.csv'));
export const loadNewsKeywords = (): string[] => parseNewsKeywords(read('news-keywords.csv'));

/** Runs a loader so one bad file hides only its own section: data, or the Spanish error message. */
export function tryLoad<T>(load: () => T): { ok: true; data: T } | { ok: false; message: string } {
  try {
    return { ok: true, data: load() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
