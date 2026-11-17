import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickZone, zoneReach, ZONE_FADE_M, type ZoneShape } from './zones';
import { M_PER_DEG_LAT, squareRing } from './test-helpers';

function circle(input: { rating: number; radiusM: number; id?: string; lat?: number; lon?: number }): ZoneShape {
  return {
    id: input.id ?? 'c',
    name: 'Parque Castilla',
    rating: input.rating,
    kind: 'CIRCLE',
    lat: input.lat ?? -12.0849,
    lon: input.lon ?? -77.0347,
    radiusM: input.radiusM,
  };
}

/** A point m meters north of the circle center. */
function offset(z: ZoneShape & { kind: 'CIRCLE' }, m: number) {
  return { lat: z.lat + m / M_PER_DEG_LAT, lon: z.lon };
}

test('the fade is 500 m', () => {
  assert.equal(ZONE_FADE_M, 500);
});

test('a circle zone has reach 1 inside and at the edge', () => {
  const z = circle({ rating: 9, radiusM: 400 }) as ZoneShape & { kind: 'CIRCLE' };
  assert.equal(zoneReach(offset(z, 399), z).reach, 1);
  assert.equal(zoneReach(offset(z, 400), z).reach, 1);
  assert.equal(zoneReach(offset(z, 100), z).distanceToEdgeM, 0);
});

test('reach falls to 0.5 at 250 m past the edge and 0 at 500 m', () => {
  const z = circle({ rating: 9, radiusM: 400 }) as ZoneShape & { kind: 'CIRCLE' };
  const half = zoneReach(offset(z, 650), z);
  assert.ok(Math.abs(half.reach - 0.5) < 0.02, `got ${half.reach}`);
  assert.ok(Math.abs(half.distanceToEdgeM - 250) < 5);
  assert.equal(zoneReach(offset(z, 900), z).reach, 0);
  assert.equal(zoneReach(offset(z, 2_000), z).reach, 0);
});

test('a district zone: reach 1 inside the polygon, fades outside', () => {
  const district: ZoneShape = {
    id: 'd',
    name: 'San Isidro',
    rating: 9,
    kind: 'DISTRICT',
    districtSlug: 'san-isidro',
    rings: [squareRing(-12.1, -77.03)],
  };
  assert.equal(zoneReach({ lat: -12.1, lon: -77.03 }, district).reach, 1);
  const near = zoneReach({ lat: -12.1 + 0.0045 + 200 / M_PER_DEG_LAT, lon: -77.03 }, district);
  assert.ok(Math.abs(near.reach - 0.6) < 0.03, `got ${near.reach}`);
});

test('pickZone: highest reach wins; a tie goes to the smaller zone', () => {
  const district: ZoneShape = {
    id: 'd',
    name: 'San Isidro',
    rating: 5,
    kind: 'DISTRICT',
    districtSlug: 'san-isidro',
    rings: [squareRing(-12.1, -77.03)],
  };
  const small = circle({ id: 'small', rating: 9, radiusM: 300, lat: -12.1, lon: -77.03 });
  const picked = pickZone({ lat: -12.1, lon: -77.03 }, [district, small]);
  assert.equal(picked?.zone.id, 'small');
  assert.equal(picked?.reach, 1);
  const pickedReversed = pickZone({ lat: -12.1, lon: -77.03 }, [small, district]);
  assert.equal(pickedReversed?.zone.id, 'small');

  // Outside the circle's fade but inside the district: the district wins.
  const farInside = { lat: -12.1 - 0.004, lon: -77.03 - 0.004 };
  const tiny = circle({ id: 'tiny', rating: 9, radiusM: 50, lat: -12.1 + 0.004, lon: -77.03 + 0.004 });
  assert.equal(pickZone(farInside, [tiny, district])?.zone.id, 'd');
});

test('pickZone returns null when no zone reaches the point', () => {
  const z = circle({ rating: 9, radiusM: 400 });
  assert.equal(pickZone({ lat: -12.2, lon: -77.0 }, [z]), null);
  assert.equal(pickZone({ lat: -12.2, lon: -77.0 }, []), null);
});
