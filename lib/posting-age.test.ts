import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysOnMarket,
  estimatePublishedAt,
  fitIdToDate,
  publishedAtFor,
  MIN_ANCHORS,
  type IdDateAnchor,
} from './posting-age';

const DAY = 86_400_000;

/** Ids allocated at a steady rate, the way Urbania actually behaves. */
function syntheticAnchors(count: number, idsPerDay = 20_000): IdDateAnchor[] {
  const start = new Date('2026-01-01T00:00:00Z').getTime();
  return Array.from({ length: count }, (_, i) => ({
    id: 140_000_000 + i * idsPerDay,
    publishedAt: new Date(start + i * DAY),
  }));
}

describe('fitIdToDate', () => {
  it('refuses to fit too few anchors', () => {
    assert.equal(fitIdToDate(syntheticAnchors(MIN_ANCHORS - 1)), null);
  });

  it('recovers a clean id-to-date relation', () => {
    const model = fitIdToDate(syntheticAnchors(40));
    assert.ok(model);
    assert.ok(model.r2 > 0.99);
    assert.equal(model.n, 40);
    assert.ok(model.medianErrorDays < 1);
  });

  it('ignores a republished listing that got a fresh id', () => {
    const anchors = syntheticAnchors(40);
    // A broker reposts a two-year-old listing: new id, ancient date.
    anchors.push({ id: 149_000_000, publishedAt: new Date('2024-02-01T00:00:00Z') });
    const model = fitIdToDate(anchors);
    assert.ok(model);
    assert.equal(model.n, 40, 'the outlier should be dropped before the final fit');
  });

  it('gives up when ids carry no date signal', () => {
    const shuffled = syntheticAnchors(40).map((a, i) => ({
      id: a.id,
      publishedAt: new Date(new Date('2026-01-01T00:00:00Z').getTime() + ((i * 7919) % 400) * DAY),
    }));
    assert.equal(fitIdToDate(shuffled), null);
  });

  it('survives anchors that all share one id', () => {
    const same = Array.from({ length: 20 }, (_, i) => ({
      id: 149_000_000,
      publishedAt: new Date(Date.UTC(2026, 0, 1 + i)),
    }));
    assert.equal(fitIdToDate(same), null);
  });
});

/**
 * Every listing in one Lince run that reported `firstDateOnline` — 11 out of 281,
 * which is why this module exists at all.
 */
const LINCE_ANCHORS: IdDateAnchor[] = [
  { id: 4_681_404, publishedAt: new Date('2024-02-02') },
  { id: 142_879_071, publishedAt: new Date('2024-03-14') },
  { id: 146_599_787, publishedAt: new Date('2025-06-02') },
  { id: 146_932_757, publishedAt: new Date('2025-07-09') },
  { id: 146_976_836, publishedAt: new Date('2025-07-15') },
  { id: 148_514_822, publishedAt: new Date('2025-12-23') },
  { id: 148_515_652, publishedAt: new Date('2025-12-23') },
  { id: 148_947_987, publishedAt: new Date('2026-02-12') },
  { id: 149_310_505, publishedAt: new Date('2026-03-20') },
  { id: 150_242_557, publishedAt: new Date('2026-06-18') },
  { id: 150_421_623, publishedAt: new Date('2026-07-10') },
];

describe('fitIdToDate on real anchors', () => {
  it('declines a single district, which does not have enough anchors yet', () => {
    // Ten modern anchors after the legacy id is excluded, against a floor of 12.
    assert.equal(fitIdToDate(LINCE_ANCHORS), null);
  });

  it('fits once several districts are pooled, and dates them within weeks', () => {
    // The same relation, with a second district's worth of anchors interleaved.
    const pooled = [
      ...LINCE_ANCHORS,
      { id: 147_400_000, publishedAt: new Date('2025-09-01') },
      { id: 147_900_000, publishedAt: new Date('2025-10-20') },
      { id: 149_700_000, publishedAt: new Date('2026-04-25') },
      { id: 150_000_000, publishedAt: new Date('2026-05-20') },
    ];
    const model = fitIdToDate(pooled);
    assert.ok(model, 'expected a model from 14 modern anchors');
    assert.ok(model.r2 > 0.9, `r2 was ${model.r2}`);
    assert.ok(model.medianErrorDays < 45, `median error was ${model.medianErrorDays} days`);
  });

  it('excludes the legacy id space instead of fitting it', () => {
    const model = fitIdToDate([
      ...LINCE_ANCHORS,
      { id: 147_400_000, publishedAt: new Date('2025-09-01') },
      { id: 147_900_000, publishedAt: new Date('2025-10-20') },
      { id: 149_700_000, publishedAt: new Date('2026-04-25') },
      { id: 150_000_000, publishedAt: new Date('2026-05-20') },
    ]);
    assert.ok(model);
    assert.ok(model.minId >= 100_000_000, `minId was ${model.minId}`);
    // A legacy id gets no estimate at all rather than a fabricated one.
    assert.equal(estimatePublishedAt(model, 61_535_155), null);
  });
});

describe('estimatePublishedAt', () => {
  const model = fitIdToDate(syntheticAnchors(40))!;

  it('dates an id inside the calibrated range', () => {
    const target = syntheticAnchors(40)[20];
    const estimate = estimatePublishedAt(model, target.id);
    assert.ok(estimate);
    assert.equal(estimate.extrapolated, false);
    const errorDays = Math.abs(estimate.publishedAt.getTime() - target.publishedAt.getTime()) / DAY;
    assert.ok(errorDays < 1, `off by ${errorDays} days`);
  });

  it('flags extrapolation below the calibrated range', () => {
    const estimate = estimatePublishedAt(model, 100_000_000);
    assert.ok(estimate);
    assert.equal(estimate.extrapolated, true);
    assert.ok(estimate.publishedAt < new Date('2026-01-01T00:00:00Z'));
  });

  it('accepts the id as a string, which is how it is stored', () => {
    assert.ok(estimatePublishedAt(model, '149000000'));
    assert.equal(estimatePublishedAt(model, 'not-a-number'), null);
  });
});

describe('publishedAtFor', () => {
  const model = fitIdToDate(syntheticAnchors(40))!;
  const firstSeenAt = new Date('2026-07-26T00:00:00Z');

  it('prefers a reported date over an estimate', () => {
    const reported = new Date('2026-03-20T00:00:00Z');
    const result = publishedAtFor({
      firstDateOnline: reported,
      sourcePostingId: '149000000',
      firstSeenAt,
      model,
    });
    assert.equal(result.estimated, false);
    assert.equal(result.publishedAt.getTime(), reported.getTime());
  });

  it('estimates from the id when no date was reported', () => {
    // 140,400,000 is 20 days into the calibrated range, so ~6 months before we
    // first saw it.
    const result = publishedAtFor({
      firstDateOnline: null,
      sourcePostingId: '140400000',
      firstSeenAt,
      model,
    });
    assert.equal(result.estimated, true);
    assert.ok(result.publishedAt < firstSeenAt);
    assert.ok(daysOnMarket(result.publishedAt, firstSeenAt) > 30);
  });

  it('never claims a listing was published after we first saw it', () => {
    const result = publishedAtFor({
      firstDateOnline: null,
      // An id far above the calibrated range extrapolates into the future.
      sourcePostingId: '900000000',
      firstSeenAt,
      model,
    });
    assert.equal(result.publishedAt.getTime(), firstSeenAt.getTime());
    assert.equal(result.estimated, true);
  });

  it('falls back to first sighting with no model at all', () => {
    const result = publishedAtFor({
      firstDateOnline: null,
      sourcePostingId: '149000000',
      firstSeenAt,
      model: null,
    });
    assert.equal(result.publishedAt.getTime(), firstSeenAt.getTime());
    assert.equal(result.estimated, true);
  });
});

describe('daysOnMarket', () => {
  it('counts whole days and never goes negative', () => {
    const asOf = new Date('2026-07-26T00:00:00Z');
    assert.equal(daysOnMarket(new Date('2026-06-26T00:00:00Z'), asOf), 30);
    assert.equal(daysOnMarket(new Date('2026-08-26T00:00:00Z'), asOf), 0);
  });
});
