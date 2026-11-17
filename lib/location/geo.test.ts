import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GridIndex,
  distanceToPolygonEdgeM,
  haversineM,
  pointInPolygon,
  polygonAreaM2,
  type Ring,
} from './geo';
import { M_PER_DEG_LAT, squareRing } from './test-helpers';

test('haversine: Parque Castilla to Óvalo Gutiérrez is about 3.9 km', () => {
  const d = haversineM({ lat: -12.0849, lon: -77.0347 }, { lat: -12.1186, lon: -77.0446 });
  assert.ok(d > 3_700 && d < 4_000, `got ${d}`);
});

test('pointInPolygon and distance to the edge of a square', () => {
  const ring = squareRing(-12.09, -77.03);
  assert.equal(pointInPolygon({ lat: -12.09, lon: -77.03 }, [ring]), true);
  assert.equal(distanceToPolygonEdgeM({ lat: -12.09, lon: -77.03 }, [ring]), 0);
  const outside = { lat: -12.09 + 0.0045 + 200 / M_PER_DEG_LAT, lon: -77.03 };
  assert.equal(pointInPolygon(outside, [ring]), false);
  const d = distanceToPolygonEdgeM(outside, [ring]);
  assert.ok(d > 190 && d < 210, `got ${d}`);
});

test('polygonAreaM2 of a 1 km square is about 1 km²', () => {
  const area = polygonAreaM2([squareRing(-12.09, -77.03)]);
  assert.ok(area > 0.9e6 && area < 1.1e6, `got ${area}`);
});

test('a degenerate polygon with zero area does not throw', () => {
  const line: Ring = [
    [-77.03, -12.09],
    [-77.02, -12.09],
    [-77.03, -12.09],
  ];
  assert.equal(polygonAreaM2([line]), 0);
  assert.equal(pointInPolygon({ lat: -12.09, lon: -77.025 }, [line]), false);
  assert.ok(Number.isFinite(distanceToPolygonEdgeM({ lat: -12.08, lon: -77.025 }, [line])));
  assert.equal(distanceToPolygonEdgeM({ lat: -12.08, lon: -77.025 }, []), Infinity);
});

test('GridIndex.near returns only items within the radius, nearest first', () => {
  const center = { lat: -12.09, lon: -77.03 };
  const items = [300, 100, 1_500, 900, 50].map((m, i) => ({ id: i, lat: center.lat + m / M_PER_DEG_LAT, lon: center.lon }));
  const found = new GridIndex(items).near(center, 1_000);
  assert.deepEqual(
    found.map((f) => f.item.id),
    [4, 1, 0, 3],
  );
  assert.ok(found[0].distanceM < found[1].distanceM);
});
