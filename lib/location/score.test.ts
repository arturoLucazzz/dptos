import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  percentileScore,
  scoreAll,
  type DistrictStatInput,
  type PlacePoint,
  type RentActivityPoint,
  type ScoreSubject,
} from './score';
import type { ZoneShape } from './zones';
import type { RentPoint } from './local-rent';
import { M_PER_DEG_LAT } from './test-helpers';

const castilla = { lat: -12.0849, lon: -77.0347 };

function subject(id: string, over: Partial<ScoreSubject> = {}): ScoreSubject {
  return { propertyId: id, districtSlug: 'lince', lat: castilla.lat, lon: castilla.lon, bedrooms: 2, ...over };
}

function north(m: number, from = castilla) {
  return { lat: from.lat + m / M_PER_DEG_LAT, lon: from.lon };
}

function zone(rating: number, radiusM = 400): ZoneShape {
  return { id: 'z', name: 'Parque Castilla', rating, kind: 'CIRCLE', ...castilla, radiusM };
}

/** One place far from every subject: place data exists, every count is 0, every percentile 5. */
const farPlace: PlacePoint = { lat: -12.5, lon: -76.7, category: 'food' };
const empty = { places: [farPlace] as PlacePoint[], zones: [] as ZoneShape[], districtStats: [] as DistrictStatInput[], rentActivity: [] as RentActivityPoint[], rents: [] as RentPoint[] };

test('percentileScore gives 5 to a lone value and splits ties', () => {
  assert.equal(percentileScore([3], 3), 5);
  assert.equal(percentileScore([1, 2, 2, 3], 2), 5);
  assert.equal(percentileScore([1, 2, 3, 4], 4), 8.75);
});

test('an apartment inside a zone rated 9 gets livability 0.6×9 + 0.4×placePart', () => {
  // One tracked apartment: every place percentile is 5, so the place part is 5.
  const [r] = scoreAll({ ...empty, subjects: [subject('a')], zones: [zone(9)] });
  assert.equal(r.status, 'OK');
  assert.equal(r.livability, 7.4);
  assert.ok(r.reasons.some((x) => x.text === 'Dentro de Parque Castilla (tu zona, 9/10)' && x.tone === 'up'));
});

test('a low-rated zone lowers livability below the place part', () => {
  const [r] = scoreAll({ ...empty, subjects: [subject('a')], zones: [zone(2)] });
  assert.equal(r.livability, 3.2);
  assert.ok(r.reasons.some((x) => x.text.startsWith('Dentro de Parque Castilla (tu zona, 2/10)') && x.tone === 'down'));
});

test('score is the plain average of livability and demand, one decimal', () => {
  const results = scoreAll({
    ...empty,
    subjects: [subject('poor', { districtSlug: 'lince' }), subject('rich', { districtSlug: 'san-isidro' })],
    districtStats: [
      { slug: 'lince', highIncomePct: { value: 20, period: '2020' }, povertyPct: null, complaintsPer10k: null },
      { slug: 'san-isidro', highIncomePct: { value: 100, period: '2020' }, povertyPct: null, complaintsPer10k: null },
    ],
  });
  const rich = results.find((r) => r.propertyId === 'rich')!;
  assert.equal(rich.livability, 5);
  assert.equal(rich.demand, 7.5);
  assert.equal(rich.score, 6.3);
  assert.ok(rich.reasons.some((x) => x.text === '100% vive en manzanas de ingreso alto (INEI 2020)'));
  const poor = results.find((r) => r.propertyId === 'poor')!;
  assert.ok(poor.reasons.some((x) => x.text === '20% vive en manzanas de ingreso alto (INEI 2020)' && x.tone === 'down'));
});

test('a missing district stat drops that signal and adds the reason', () => {
  const [r] = scoreAll({
    ...empty,
    subjects: [subject('a')],
    districtStats: [{ slug: 'lince', highIncomePct: { value: 50, period: '2020' }, povertyPct: null, complaintsPer10k: null }],
  });
  assert.equal(r.demand, 5);
  assert.ok(r.reasons.some((x) => x.text === 'Sin datos de delitos para este distrito' && x.tone === 'info'));
  assert.ok(!r.reasons.some((x) => x.text === 'Sin datos de ingresos para este distrito'));
});

test('no demand signal at all: score equals livability', () => {
  const [r] = scoreAll({ ...empty, subjects: [subject('a')], zones: [zone(9)] });
  assert.equal(r.demand, null);
  assert.equal(r.score, r.livability);
  assert.ok(r.reasons.some((x) => x.text === 'Pocos alquileres cercanos para medir la demanda'));
  assert.ok(r.reasons.some((x) => x.text === 'Sin datos de ingresos para este distrito'));
});

test('outside Lima and no coordinates get null scores and the right status', () => {
  const results = scoreAll({
    ...empty,
    subjects: [subject('callao', { districtSlug: 'callao' }), subject('nocoords', { lat: null, lon: null })],
  });
  const callao = results.find((r) => r.propertyId === 'callao')!;
  assert.equal(callao.status, 'OUTSIDE_LIMA');
  assert.equal(callao.score, null);
  assert.equal(callao.localRent, null);
  assert.deepEqual(callao.reasons, []);
  const nocoords = results.find((r) => r.propertyId === 'nocoords')!;
  assert.equal(nocoords.status, 'NO_COORDINATES');
  assert.equal(nocoords.livability, null);
});

test('the zone reason names the distance rounded to 10 m', () => {
  // 604 m from the center of a 400 m circle: 204 m past the edge.
  const [r] = scoreAll({ ...empty, subjects: [subject('a', north(604))], zones: [zone(9)] });
  assert.ok(
    r.reasons.some((x) => x.text === 'Cerca de Parque Castilla (tu zona, 9/10), a 200 m'),
    JSON.stringify(r.reasons),
  );
});

test('place counts within 500 m feed the place part and the reason', () => {
  const places: PlacePoint[] = [
    ...[100, 200, 300].map((m) => ({ ...north(m), category: 'food' as const })),
    { ...north(150), category: 'park' },
    { ...north(900), category: 'park' }, // too far
  ];
  const far = north(3_000);
  const results = scoreAll({ ...empty, subjects: [subject('near'), subject('far', far)], places });
  const near = results.find((r) => r.propertyId === 'near')!;
  assert.ok(near.reasons.some((x) => x.text === '3 restaurantes y 1 parques a menos de 500 m'));
  const farResult = results.find((r) => r.propertyId === 'far')!;
  assert.ok(near.livability! > farResult.livability!);
});

test('rent listings drive the live-count and speed signals', () => {
  const activity: RentActivityPoint[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ ...north(100 + i * 50), live: true, daysOnline: null })),
    ...Array.from({ length: 5 }, (_, i) => ({ ...north(120 + i * 50), live: false, daysOnline: 21 })),
  ];
  const far = north(5_000);
  const farActivity: RentActivityPoint[] = Array.from({ length: 5 }, (_, i) => ({ ...north(100 + i * 50, far), live: false, daysOnline: 90 }));
  const results = scoreAll({
    ...empty,
    subjects: [subject('fast'), subject('slow', far)],
    rentActivity: [...activity, ...farActivity],
  });
  const fast = results.find((r) => r.propertyId === 'fast')!;
  const slow = results.find((r) => r.propertyId === 'slow')!;
  assert.ok(fast.reasons.some((x) => x.text === 'Los alquileres cercanos se van rápido (mediana 21 días)'));
  assert.ok(slow.reasons.some((x) => x.text === 'Los alquileres cercanos tardan en irse (mediana 90 días)'));
  assert.ok(fast.demand! > slow.demand!);
});

test('localRent is attached to OK results', () => {
  const rents: RentPoint[] = Array.from({ length: 10 }, (_, i) => ({ ...north(50 + i * 40), perM2: 30, bedrooms: 2 }));
  const [r] = scoreAll({ ...empty, subjects: [subject('a')], rents });
  assert.equal(r.localRent?.middlePerM2, 30);
  assert.equal(r.localRent?.n, 10);
});

test('with no places at all, the place part is left out and the reason says so', () => {
  const results = scoreAll({
    ...empty,
    places: [],
    subjects: [subject('a'), subject('b', { districtSlug: 'san-isidro' })],
    districtStats: [
      { slug: 'lince', highIncomePct: { value: 20, period: '2020' }, povertyPct: null, complaintsPer10k: null },
      { slug: 'san-isidro', highIncomePct: { value: 100, period: '2020' }, povertyPct: null, complaintsPer10k: null },
    ],
  });
  const a = results.find((r) => r.propertyId === 'a')!;
  assert.equal(a.livability, null);
  assert.equal(a.score, a.demand);
  assert.ok(a.reasons.some((x) => x.text === 'Sin datos de lugares (corre pnpm location:places)'));
  assert.ok(!a.reasons.some((x) => x.text.includes('restaurantes')));

  // A zone still gives livability on its own.
  const [z] = scoreAll({ ...empty, places: [], subjects: [subject('z')], zones: [zone(9)] });
  assert.equal(z.livability, 9);
  assert.equal(z.score, 9);
});

test('with neither places, zones, nor demand signals, there is no score', () => {
  const [r] = scoreAll({ ...empty, places: [], subjects: [subject('a')] });
  assert.equal(r.status, 'OK');
  assert.equal(r.score, null);
  assert.equal(r.livability, null);
});

test('income, poverty, and complaints each add a signal and a reason with the source year', () => {
  const stats = [
    { slug: 'lince', highIncomePct: { value: 19.9, period: '2020' }, povertyPct: { value: 6, period: '2018' }, complaintsPer10k: { value: 300, period: '2024-11..2025-10' } },
    { slug: 'san-isidro', highIncomePct: { value: 100, period: '2020' }, povertyPct: { value: 1, period: '2018' }, complaintsPer10k: { value: 100, period: '2024-11..2025-10' } },
  ];
  const results = scoreAll({ ...empty, subjects: [subject('poor'), subject('rich', { districtSlug: 'san-isidro' })], districtStats: stats });
  const rich = results.find((r) => r.propertyId === 'rich')!;
  assert.equal(rich.demand, 7.5);
  assert.ok(rich.reasons.some((x) => x.text === '100% vive en manzanas de ingreso alto (INEI 2020)' && x.tone === 'up'));
  assert.ok(rich.reasons.some((x) => x.text === 'Pobreza baja en el distrito (INEI 2018)' && x.tone === 'up'));
  assert.ok(rich.reasons.some((x) => x.text === 'Pocas denuncias en el distrito (SIDPOL 2025)' && x.tone === 'up'));
  const poor = results.find((r) => r.propertyId === 'poor')!;
  assert.ok(poor.reasons.some((x) => x.text === '20% vive en manzanas de ingreso alto (INEI 2020)' && x.tone === 'down'));
});

test('a district with no statistics drops those signals and does not crash', () => {
  const [r] = scoreAll({ ...empty, subjects: [subject('a')], districtStats: [{ slug: 'lince', highIncomePct: null, povertyPct: null, complaintsPer10k: null }] });
  assert.equal(r.demand, null);
  assert.ok(r.reasons.some((x) => x.text === 'Sin datos de ingresos para este distrito'));
  assert.ok(r.reasons.some((x) => x.text === 'Sin datos de pobreza para este distrito'));
  assert.ok(r.reasons.some((x) => x.text === 'Sin datos de delitos para este distrito'));
});

test('an indicator left out of the score (undefined) adds no signal and no reason', () => {
  const stats = [
    { slug: 'lince', highIncomePct: { value: 20, period: '2020' }, povertyPct: null },
    { slug: 'san-isidro', highIncomePct: { value: 100, period: '2020' }, povertyPct: null },
  ];
  const results = scoreAll({ ...empty, subjects: [subject('poor'), subject('rich', { districtSlug: 'san-isidro' })], districtStats: stats });
  const rich = results.find((r) => r.propertyId === 'rich')!;
  assert.equal(rich.demand, 7.5);
  assert.ok(!rich.reasons.some((x) => x.text.includes('delitos') || x.text.includes('denuncias')), JSON.stringify(rich.reasons));
});

test('poverty is compared in whole percents, so districts INEI cannot tell apart tie', () => {
  const stats = [
    { slug: 'jesus-maria', povertyPct: { value: 0.55, period: '2018' } },
    { slug: 'pueblo-libre', povertyPct: { value: 0.8, period: '2018' } },
  ];
  const results = scoreAll({ ...empty, subjects: [subject('jm', { districtSlug: 'jesus-maria' }), subject('pl', { districtSlug: 'pueblo-libre' })], districtStats: stats });
  assert.equal(results[0].demand, results[1].demand);
});
