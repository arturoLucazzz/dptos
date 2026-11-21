import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circleRing, closeHitRadiusPx, draftTap, pointsToFeatures, ratingColor, undoLastPoint, unitPoints, projectPoints, zoneOutlines } from './map-features';

test('pointsToFeatures builds one GeoJSON point per row, with the gain', () => {
  const fc = pointsToFeatures([
    ['a', -77.03, -12.1, 120],
    ['b', -77.04, -12.11, null],
  ]);
  assert.equal(fc.type, 'FeatureCollection');
  assert.deepEqual(fc.features[0], {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-77.03, -12.1] },
    properties: { id: 'a', gain: 120 },
  });
  assert.equal(fc.features[1].properties.gain, null);
});

test('unitPoints and projectPoints keep only rows with coordinates', () => {
  assert.deepEqual(
    unitPoints([
      { postingId: 'u1', lat: -12.1000004, lon: -77.0300049, monthlyGainPen: -50.4 },
      { postingId: 'u2', lat: null, lon: -77.03, monthlyGainPen: 10 },
    ]),
    [['u1', -77.03, -12.1, -50]],
    'coordinates round to 5 decimals and the gain to whole soles',
  );
  assert.deepEqual(
    projectPoints([
      { projectId: 'p1', lat: -12.1, lon: -77.03 },
      { projectId: 'p2', lat: null, lon: null },
    ]),
    [['p1', -77.03, -12.1, null]],
  );
});

test('ratingColor goes from loss at 0 through muted at 5 to gain at 10', () => {
  assert.equal(ratingColor(0), '#fb7185');
  assert.equal(ratingColor(5), '#939aa6');
  assert.equal(ratingColor(10), '#34d399');
  assert.match(ratingColor(7), /^#[0-9a-f]{6}$/);
  assert.notEqual(ratingColor(7), ratingColor(5));
});

test('circleRing is closed and about the radius from the center', () => {
  const ring = circleRing(-12.1, -77.03, 400, 32);
  assert.equal(ring.length, 33);
  assert.deepEqual(ring[0], ring[32]);
  const [lon, lat] = ring[8];
  const dy = (lat + 12.1) * 111_195;
  const dx = (lon + 77.03) * 111_195 * Math.cos((12.1 * Math.PI) / 180);
  assert.ok(Math.abs(Math.hypot(dx, dy) - 400) < 2);
});

test('zoneOutlines turns each zone into a polygon with its rating color', () => {
  const ring: [number, number][] = [[-77.04, -12.12], [-77.02, -12.12], [-77.02, -12.1], [-77.04, -12.12]];
  const fc = zoneOutlines([
    { id: 'p', name: 'Mi zona', rating: 10, rings: [ring] },
    { id: 'e', name: 'Vacía', rating: 3, rings: [] },
  ]);
  assert.equal(fc.features.length, 1);
  assert.deepEqual(fc.features[0].geometry, { type: 'Polygon', coordinates: [ring] });
  assert.deepEqual(fc.features[0].properties, { id: 'p', name: 'Mi zona', rating: 10, color: '#34d399' });
});

test('closeHitRadiusPx is larger on a touch screen', () => {
  assert.equal(closeHitRadiusPx(false), 12);
  assert.equal(closeHitRadiusPx(true), 28);
});

test('draftTap closes near the first point once there are 3 points, else adds', () => {
  const three: [number, number][] = [[-77.04, -12.12], [-77.02, -12.12], [-77.02, -12.1]];
  const first = { x: 100, y: 100 };
  // 20 px away: a close on touch, an add with a mouse.
  assert.equal(draftTap({ count: 3, firstPx: first, tapPx: { x: 120, y: 100 }, radiusPx: 28, max: 50 }), 'close');
  assert.equal(draftTap({ count: 3, firstPx: first, tapPx: { x: 120, y: 100 }, radiusPx: 12, max: 50 }), 'add');
  // Two points cannot close yet.
  assert.equal(draftTap({ count: 2, firstPx: first, tapPx: first, radiusPx: 28, max: 50 }), 'add');
  assert.equal(draftTap({ count: 0, firstPx: null, tapPx: first, radiusPx: 28, max: 50 }), 'add');
  // Full: no more points, but a close still works.
  assert.equal(draftTap({ count: 50, firstPx: first, tapPx: { x: 400, y: 400 }, radiusPx: 12, max: 50 }), 'full');
  assert.equal(draftTap({ count: 50, firstPx: first, tapPx: first, radiusPx: 12, max: 50 }), 'close');
  assert.equal(three.length, 3);
});

test('undoLastPoint drops the last point and leaves an empty draft empty', () => {
  assert.deepEqual(undoLastPoint([[1, 2], [3, 4]]), [[1, 2]]);
  assert.deepEqual(undoLastPoint([]), []);
});
