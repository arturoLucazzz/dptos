/**
 * The numbers checked here come from the plan's worked examples, which were taken
 * from the actual rules: alcabala of S/ 10,320 on a used S/ 400,000 apartment, and
 * predial of roughly S/ 70 a month on the same one.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  alcabala,
  annualPredial,
  monthlyArbitrios,
  monthlyCosts,
  monthlyMaintenance,
  purchaseCosts,
  type CostAssumptions,
} from './costs';

const UIT_2025 = 5_350;

const ASSUMPTIONS: CostAssumptions = {
  uit: UIT_2025,
  alcabalaRatePct: 3,
  alcabalaExemptUit: 10,
  alcabalaFirstSaleLandSharePct: 50,
  notaryCost: 1_000,
  registryPct: 0.3,
  appraisalCost: 600,
  titleStudyCost: 400,
  assessedValueRatio: 0.5,
  arbitriosByDistrict: { lince: 100, miraflores: 180 },
  defaultArbitrios: 120,
  defaultMaintenancePerM2: 4,
};

describe('alcabala', () => {
  it('taxes only the excess over 10 UIT on a used apartment', () => {
    // (400,000 - 53,500) x 3% = 10,395.
    const tax = alcabala({ pricePen: 400_000, isFirstSaleFromDeveloper: false, assumptions: ASSUMPTIONS });
    assert.ok(Math.abs(tax - 10_395) < 1, `alcabala was ${tax}`);
  });

  it('is much smaller on the developer first sale, which is the whole point', () => {
    const used = alcabala({ pricePen: 400_000, isFirstSaleFromDeveloper: false, assumptions: ASSUMPTIONS });
    const brandNew = alcabala({ pricePen: 400_000, isFirstSaleFromDeveloper: true, assumptions: ASSUMPTIONS });
    // Only the land half is taxable: (200,000 - 53,500) x 3% = 4,395.
    assert.ok(Math.abs(brandNew - 4_395) < 1, `first-sale alcabala was ${brandNew}`);
    assert.ok(brandNew < used / 2);
  });

  it('goes to zero when the land share assumption does', () => {
    const tax = alcabala({
      pricePen: 400_000,
      isFirstSaleFromDeveloper: true,
      assumptions: { ...ASSUMPTIONS, alcabalaFirstSaleLandSharePct: 0 },
    });
    assert.equal(tax, 0);
  });

  it('charges nothing below the exemption', () => {
    assert.equal(alcabala({ pricePen: 50_000, isFirstSaleFromDeveloper: false, assumptions: ASSUMPTIONS }), 0);
    assert.equal(alcabala({ pricePen: 0, isFirstSaleFromDeveloper: false, assumptions: ASSUMPTIONS }), 0);
  });

  it('follows the UIT when it changes', () => {
    const higher = alcabala({
      pricePen: 400_000,
      isFirstSaleFromDeveloper: false,
      assumptions: { ...ASSUMPTIONS, uit: 6_000 },
    });
    const base = alcabala({ pricePen: 400_000, isFirstSaleFromDeveloper: false, assumptions: ASSUMPTIONS });
    assert.ok(higher < base, 'a bigger UIT exempts more and taxes less');
  });
});

describe('purchaseCosts', () => {
  it('adds up to a few percent of the price on a used apartment', () => {
    const costs = purchaseCosts({
      pricePen: 400_000,
      isFirstSaleFromDeveloper: false,
      assumptions: ASSUMPTIONS,
    });
    // 10,395 alcabala + 1,000 notary + 1,200 registry + 600 + 400 = 13,595.
    assert.ok(Math.abs(costs.totalPen - 13_595) < 1, `total was ${costs.totalPen}`);
    assert.ok(Math.abs(costs.pctOfPrice - 3.4) < 0.05, `pct was ${costs.pctOfPrice}`);
  });

  it('makes the used apartment the more expensive one to enter', () => {
    const used = purchaseCosts({ pricePen: 400_000, isFirstSaleFromDeveloper: false, assumptions: ASSUMPTIONS });
    const brandNew = purchaseCosts({ pricePen: 400_000, isFirstSaleFromDeveloper: true, assumptions: ASSUMPTIONS });
    const gapPoints = used.pctOfPrice - brandNew.pctOfPrice;
    assert.ok(gapPoints > 1, `the gap was only ${gapPoints.toFixed(2)} points`);
  });

  it('labels which lines are guesses', () => {
    const costs = purchaseCosts({ pricePen: 400_000, isFirstSaleFromDeveloper: false, assumptions: ASSUMPTIONS });
    const registry = costs.lines.find((l) => l.label.startsWith('Registro'))!;
    const notary = costs.lines.find((l) => l.label === 'Notaría')!;
    assert.equal(registry.estimated, false, 'a percentage of the price is not a guess');
    assert.equal(notary.estimated, true, 'a flat notary fee is');
  });

  it('never charges a percentage of nothing', () => {
    const costs = purchaseCosts({ pricePen: 0, isFirstSaleFromDeveloper: false, assumptions: ASSUMPTIONS });
    assert.equal(costs.pctOfPrice, 0);
  });
});

describe('annualPredial', () => {
  it('comes out near S/ 70 a month on a S/ 400,000 apartment', () => {
    // Assessed 200,000: 80,250 at 0.2% + 119,750 at 0.6% = 878.
    const annual = annualPredial({ pricePen: 400_000, assumptions: ASSUMPTIONS });
    assert.ok(Math.abs(annual / 12 - 73) < 2, `monthly predial was ${(annual / 12).toFixed(2)}`);
  });

  it('charges each bracket only on its own slice', () => {
    // Assessed exactly 15 UIT: the whole thing at 0.2%.
    const assessed = 15 * UIT_2025;
    const annual = annualPredial({ pricePen: assessed / 0.5, assumptions: ASSUMPTIONS });
    assert.ok(Math.abs(annual - assessed * 0.002) < 1, `predial was ${annual}`);
  });

  it('reaches the top bracket without applying it to everything', () => {
    const assessed = 100 * UIT_2025;
    const annual = annualPredial({ pricePen: assessed / 0.5, assumptions: ASSUMPTIONS });
    const flatTopRate = assessed * 0.01;
    assert.ok(annual < flatTopRate, 'the top rate must not apply to the lower slices');
    assert.ok(annual > assessed * 0.006);
  });

  it('respects the legal minimum on a cheap apartment', () => {
    const annual = annualPredial({ pricePen: 1_000, assumptions: ASSUMPTIONS });
    assert.ok(Math.abs(annual - 0.006 * UIT_2025) < 0.01, `predial was ${annual}`);
  });

  it('is monotonic in price', () => {
    let previous = 0;
    for (const price of [100_000, 200_000, 400_000, 800_000, 2_000_000]) {
      const annual = annualPredial({ pricePen: price, assumptions: ASSUMPTIONS });
      assert.ok(annual > previous, `predial fell at ${price}`);
      previous = annual;
    }
  });
});

describe('monthlyArbitrios', () => {
  it('uses the district table when it has the district', () => {
    assert.deepEqual(monthlyArbitrios({ districtSlug: 'lince', assumptions: ASSUMPTIONS }), {
      amountPen: 100,
      estimated: false,
    });
  });

  it('falls back and says so for a district nobody filled in', () => {
    assert.deepEqual(monthlyArbitrios({ districtSlug: 'surquillo', assumptions: ASSUMPTIONS }), {
      amountPen: 120,
      estimated: true,
    });
  });
});

describe('monthlyMaintenance', () => {
  it('prefers what the listing published', () => {
    assert.deepEqual(
      monthlyMaintenance({ publishedPen: 250, areaM2: 65, assumptions: ASSUMPTIONS }),
      { amountPen: 250, estimated: false }
    );
  });

  it('estimates from area when the listing is silent', () => {
    assert.deepEqual(monthlyMaintenance({ publishedPen: null, areaM2: 65, assumptions: ASSUMPTIONS }), {
      amountPen: 260,
      estimated: true,
    });
  });

  it('does not invent a fee with no area either', () => {
    assert.deepEqual(monthlyMaintenance({ publishedPen: null, areaM2: null, assumptions: ASSUMPTIONS }), {
      amountPen: 0,
      estimated: true,
    });
  });
});

describe('monthlyCosts', () => {
  it('totals maintenance, predial and arbitrios', () => {
    const costs = monthlyCosts({
      pricePen: 400_000,
      areaM2: 65,
      districtSlug: 'lince',
      publishedMaintenancePen: 250,
      assumptions: ASSUMPTIONS,
    });
    // 250 maintenance + ~73 predial + 100 arbitrios.
    assert.ok(Math.abs(costs.totalPen - 423) < 2, `total was ${costs.totalPen}`);
    assert.equal(costs.lines.length, 3);
  });

  it('reports that a total contains estimates', () => {
    const known = monthlyCosts({
      pricePen: 400_000,
      areaM2: 65,
      districtSlug: 'lince',
      publishedMaintenancePen: 250,
      assumptions: ASSUMPTIONS,
    });
    // Predial always rests on an assumed assessed value, so a total is never exact.
    assert.equal(known.hasEstimates, true);
    assert.equal(known.lines.find((l) => l.label === 'Mantenimiento')!.estimated, false);

    const guessed = monthlyCosts({
      pricePen: 400_000,
      areaM2: 65,
      districtSlug: 'surquillo',
      publishedMaintenancePen: null,
      assumptions: ASSUMPTIONS,
    });
    assert.equal(guessed.lines.every((l) => l.estimated), true);
  });
});
