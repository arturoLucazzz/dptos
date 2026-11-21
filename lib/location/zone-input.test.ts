import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCoordinates, validateZoneInput } from './zone-input';

test('parseCoordinates reads a Google Maps @ link', () => {
  assert.deepEqual(parseCoordinates('https://www.google.com/maps/place/Parque+Castilla/@-12.0849,-77.0347,17z'), { lat: -12.0849, lon: -77.0347 });
});

test('parseCoordinates reads !3d!4d, ?q=, and plain pairs', () => {
  assert.deepEqual(parseCoordinates('https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0:0x0!8m2!3d-12.0851!4d-77.0349'), { lat: -12.0851, lon: -77.0349 });
  assert.deepEqual(parseCoordinates('https://maps.google.com/?q=-12.1,-77.03'), { lat: -12.1, lon: -77.03 });
  assert.deepEqual(parseCoordinates('-12.0849, -77.0347'), { lat: -12.0849, lon: -77.0347 });
  assert.deepEqual(parseCoordinates('  -12.0849,-77.0347  '), { lat: -12.0849, lon: -77.0347 });
});

test('parseCoordinates prefers the place pin (!3d!4d) over the map view (@)', () => {
  assert.deepEqual(
    parseCoordinates('https://www.google.com/maps/place/X/@-12.09,-77.04,17z/data=!3m1!4b1!4m6!3m5!8m2!3d-12.0851!4d-77.0349'),
    { lat: -12.0851, lon: -77.0349 },
  );
});

test('parseCoordinates returns null for a short link it cannot read', () => {
  assert.equal(parseCoordinates('https://maps.app.goo.gl/abc123'), null);
  assert.equal(parseCoordinates(''), null);
  assert.equal(parseCoordinates('Parque Castilla'), null);
});

const point = { name: 'Parque Castilla', kind: 'CIRCLE', coordinates: '-12.0849, -77.0347', radiusM: '', rating: '9', notes: '' };

test('validateZoneInput defaults the radius to 400', () => {
  const r = validateZoneInput(point);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.zone, { name: 'Parque Castilla', kind: 'CIRCLE', lat: -12.0849, lon: -77.0347, radiusM: 400, districtSlug: null, rating: 9, notes: null });
});

test('validateZoneInput rejects coordinates outside Lima', () => {
  const r = validateZoneInput({ ...point, coordinates: '-13.5, -71.97' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.coordinates, 'Las coordenadas no están en Lima');
});

test('validateZoneInput rejects a link it cannot read', () => {
  const r = validateZoneInput({ ...point, coordinates: 'https://maps.app.goo.gl/abc123' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.coordinates, 'No pude leer las coordenadas. Pega un enlace de Google Maps o escribe "lat, lon"');
});

test('validateZoneInput rejects a rating of 11 and a missing name', () => {
  const r = validateZoneInput({ ...point, name: '  ', rating: '11' });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.errors.name, 'Escribe un nombre');
    assert.equal(r.errors.rating, 'La nota va de 0 a 10');
  }
  const decimal = validateZoneInput({ ...point, rating: '7.5' });
  assert.equal(decimal.ok, false);
});

test('validateZoneInput rejects a radius outside 50 to 3000 m', () => {
  const r = validateZoneInput({ ...point, radiusM: '20' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.radiusM, 'El radio va de 50 a 3000 m');
});

test('validateZoneInput rejects a district outside Lima and accepts one inside', () => {
  const bad = validateZoneInput({ name: 'Callao', kind: 'DISTRICT', districtSlug: 'callao', rating: '3' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.errors.districtSlug, 'Elige un distrito de Lima');
  const good = validateZoneInput({ name: 'San Isidro', kind: 'DISTRICT', districtSlug: 'san-isidro', rating: '9', notes: 'Casi siempre bonito' });
  assert.equal(good.ok, true);
  if (good.ok) assert.deepEqual(good.zone, { name: 'San Isidro', kind: 'DISTRICT', districtSlug: 'san-isidro', lat: null, lon: null, radiusM: null, rating: 9, notes: 'Casi siempre bonito' });
});

test('validateZoneInput for a drawn zone reads only the name, rating, and note', () => {
  const r = validateZoneInput({ name: ' Mi zona ', kind: 'POLYGON', rating: '7', notes: ' tranquila ', coordinates: 'x', radiusM: '1' });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.zone, { name: 'Mi zona', kind: 'POLYGON', districtSlug: null, lat: null, lon: null, radiusM: null, rating: 7, notes: 'tranquila' });
  const bad = validateZoneInput({ name: '', kind: 'POLYGON', rating: '12' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['name', 'rating']);
});
