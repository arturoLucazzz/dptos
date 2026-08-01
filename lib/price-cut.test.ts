import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inventoryMonths,
  priceCutScore,
  totalCutFromPeak,
} from "./price-cut";

describe("priceCutScore", () => {
  it("is zero when every signal is empty", () => {
    assert.equal(
      priceCutScore({
        daysPublished: null,
        priceCutCount: 0,
        totalCutPct: 0,
        listingCount: 1,
        inventoryMonths: null,
      }).score,
      0
    );
  });

  it("rises with days on market", () => {
    const young = priceCutScore({
      daysPublished: 10,
      priceCutCount: 0,
      totalCutPct: 0,
      listingCount: 1,
      inventoryMonths: null,
    });
    const old = priceCutScore({
      daysPublished: 120,
      priceCutCount: 0,
      totalCutPct: 0,
      listingCount: 1,
      inventoryMonths: null,
    });
    assert.ok(old.score > young.score);
    assert.equal(old.score, 20);
  });

  it("treats multi-listing as a strong early signal", () => {
    const alone = priceCutScore({
      daysPublished: null,
      priceCutCount: 0,
      totalCutPct: 0,
      listingCount: 1,
      inventoryMonths: null,
    });
    const triple = priceCutScore({
      daysPublished: null,
      priceCutCount: 0,
      totalCutPct: 0,
      listingCount: 3,
      inventoryMonths: null,
    });
    assert.equal(alone.score, 0);
    assert.equal(triple.score, 25);
  });

  it("caps each component so one extreme cannot pin the score", () => {
    const score = priceCutScore({
      daysPublished: 1000,
      priceCutCount: 20,
      totalCutPct: 0.9,
      listingCount: 10,
      inventoryMonths: 50,
    });
    assert.equal(score.score, 100);
  });

  it("combines inventory months when sales history exists", () => {
    const score = priceCutScore({
      daysPublished: null,
      priceCutCount: 0,
      totalCutPct: 0,
      listingCount: 1,
      inventoryMonths: 8,
    });
    assert.equal(score.score, 25);
  });
});

describe("inventoryMonths", () => {
  it("is live listings over monthly sales", () => {
    // 90 live, 30 sold in 90 days => 10 sales/month => 9 months of inventory.
    assert.equal(inventoryMonths({ liveCount: 90, soldLast90Days: 30 }), 9);
  });

  it("withholds the signal when nothing has sold", () => {
    assert.equal(inventoryMonths({ liveCount: 90, soldLast90Days: 0 }), null);
  });

  it("is zero for an empty district", () => {
    assert.equal(inventoryMonths({ liveCount: 0, soldLast90Days: 10 }), 0);
  });
});

describe("totalCutFromPeak", () => {
  it("measures the drop from the high-water mark", () => {
    assert.ok(Math.abs(totalCutFromPeak(500_000, 450_000) - 0.1) < 1e-9);
  });

  it("is zero when the price has not fallen", () => {
    assert.equal(totalCutFromPeak(400_000, 420_000), 0);
    assert.equal(totalCutFromPeak(400_000, 400_000), 0);
    assert.equal(totalCutFromPeak(null, 400_000), 0);
  });
});
