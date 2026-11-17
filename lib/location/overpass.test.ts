import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverpassQuery, parseOverpassBoundaries, parseOverpassPlaces } from './overpass';

test('buildOverpassQuery is one query with out center and out geom', () => {
  const q = buildOverpassQuery();
  assert.match(q, /area\["name"="Lima"\]\["admin_level"="6"\]/);
  assert.match(q, /out center tags;/);
  assert.match(q, /out geom;/);
  assert.match(q, /admin_level"="8"/);
  assert.match(q, /restaurant\|cafe\|fast_food/);
});

test('parseOverpassPlaces maps tags to categories and uses the way center', () => {
  const places = parseOverpassPlaces({
    elements: [
      { type: 'node', id: 1, lat: -12.08, lon: -77.03, tags: { amenity: 'cafe', name: 'Café Uno' } },
      { type: 'way', id: 2, center: { lat: -12.09, lon: -77.04 }, tags: { leisure: 'park', name: 'Parque Castilla' } },
      { type: 'node', id: 3, lat: -12.1, lon: -77.0, tags: { shop: 'supermarket' } },
      { type: 'node', id: 4, lat: -12.1, lon: -77.0, tags: { amenity: 'pharmacy' } },
      { type: 'node', id: 5, lat: -12.1, lon: -77.0, tags: { highway: 'bus_stop' } },
      { type: 'node', id: 6, lat: -12.1, lon: -77.0, tags: { place: 'square' } },
      { type: 'node', id: 7, lat: -12.1, lon: -77.0, tags: { amenity: 'marketplace' } },
      { type: 'node', id: 8, lat: -12.1, lon: -77.0, tags: { public_transport: 'station' } },
    ],
  });
  assert.deepEqual(places[0], { id: 'node/1', category: 'food', name: 'Café Uno', lat: -12.08, lon: -77.03 });
  assert.deepEqual(places[1], { id: 'way/2', category: 'park', name: 'Parque Castilla', lat: -12.09, lon: -77.04 });
  assert.deepEqual(
    places.map((p) => p.category),
    ['food', 'park', 'shop', 'services', 'transit', 'park', 'shop', 'transit'],
  );
  assert.equal(places[2].name, null);
});

test('parseOverpassPlaces skips elements with no known tag or no position', () => {
  const places = parseOverpassPlaces({
    elements: [
      { type: 'node', id: 1, lat: -12.08, lon: -77.03, tags: { amenity: 'bank' } },
      { type: 'node', id: 2, lat: -12.08, lon: -77.03 },
      { type: 'way', id: 3, tags: { amenity: 'cafe' } },
      { type: 'relation', id: 4, tags: { boundary: 'administrative', admin_level: '8', name: 'Lince' } },
    ],
  });
  assert.deepEqual(places, []);
  assert.deepEqual(parseOverpassPlaces(null), []);
});

test('parseOverpassBoundaries joins outer ways into a closed ring and matches "Jesús María" to jesus-maria', () => {
  const boundaries = parseOverpassBoundaries({
    elements: [
      {
        type: 'relation',
        id: 10,
        tags: { boundary: 'administrative', admin_level: '8', name: 'Jesús María' },
        members: [
          { type: 'way', role: 'outer', geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }] },
          // Reversed on purpose: the joiner must flip it.
          { type: 'way', role: 'outer', geometry: [{ lat: 1, lon: 1 }, { lat: 0, lon: 1 }] },
          { type: 'way', role: 'outer', geometry: [{ lat: 1, lon: 1 }, { lat: 0, lon: 0 }] },
          { type: 'way', role: 'inner', geometry: [{ lat: 0.2, lon: 0.2 }, { lat: 0.3, lon: 0.3 }] },
        ],
      },
      {
        type: 'relation',
        id: 11,
        tags: { boundary: 'administrative', admin_level: '8', name: 'Bellavista' },
        members: [{ type: 'way', role: 'outer', geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 0, lon: 0 }] }],
      },
    ],
  });
  assert.equal(boundaries.length, 1);
  assert.equal(boundaries[0].slug, 'jesus-maria');
  assert.equal(boundaries[0].name, 'Jesús María');
  assert.equal(boundaries[0].rings.length, 1);
  const ring = boundaries[0].rings[0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  assert.deepEqual(ring, [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
  ]);
});

test('parseOverpassBoundaries matches "Magdalena del Mar" and "Cercado de Lima"', () => {
  const rel = (name: string) => ({
    type: 'relation',
    id: name.length,
    tags: { boundary: 'administrative', admin_level: '8', name },
    members: [{ type: 'way', role: 'outer', geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }, { lat: 0, lon: 0 }] }],
  });
  const slugs = parseOverpassBoundaries({ elements: [rel('Magdalena del Mar'), rel('Lima'), rel('Breña')] }).map((b) => b.slug);
  assert.deepEqual(slugs, ['magdalena', 'lima', 'brena']);
});
