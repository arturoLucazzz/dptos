import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePolygon } from './polygon-input';

// [lon, lat] pairs in Miraflores.
const A: [number, number] = [-77.04, -12.12];
const B: [number, number] = [-77.02, -12.12];
const C: [number, number] = [-77.02, -12.1];
const D: [number, number] = [-77.04, -12.1];

test('validatePolygon needs at least 3 points', () => {
  assert.deepEqual(validatePolygon([A, B]), { ok: false, error: 'Dibuja al menos 3 puntos.' });
  // A repeated point does not count twice.
  assert.deepEqual(validatePolygon([A, B, B]), { ok: false, error: 'Dibuja al menos 3 puntos.' });
});

test('validatePolygon allows at most 50 points', () => {
  const circle: [number, number][] = Array.from({ length: 51 }, (_, i) => {
    const t = (2 * Math.PI * i) / 51;
    return [-77.03 + 0.01 * Math.cos(t), -12.11 + 0.01 * Math.sin(t)];
  });
  assert.deepEqual(validatePolygon(circle), { ok: false, error: 'Usa como máximo 50 puntos.' });
  assert.equal(validatePolygon(circle.slice(0, 50)).ok, true);
});

test('validatePolygon rejects a bow tie', () => {
  assert.deepEqual(validatePolygon([A, C, B, D]), { ok: false, error: 'Los bordes no pueden cruzarse.' });
});

test('validatePolygon rejects a point outside Lima', () => {
  assert.deepEqual(validatePolygon([A, B, [-71.97, -13.5]]), { ok: false, error: 'La zona debe estar dentro de Lima.' });
});

test('validatePolygon rejects points that are not numbers', () => {
  assert.equal(validatePolygon([A, B, [Number.NaN, -12.1]]).ok, false);
});

test('validatePolygon rejects points on one line', () => {
  assert.deepEqual(validatePolygon([A, B, [-77.0, -12.12]]), { ok: false, error: 'La zona no tiene área.' });
});

test('a valid triangle returns a closed ring of 4 pairs', () => {
  const r = validatePolygon([A, B, C]);
  assert.deepEqual(r, { ok: true, ring: [A, B, C, A] });
});

test('an already closed ring stays closed once', () => {
  const r = validatePolygon([A, B, C, D, A]);
  assert.deepEqual(r, { ok: true, ring: [A, B, C, D, A] });
});
