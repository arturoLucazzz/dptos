/**
 * Probability that a seller will cut the price.
 *
 * Not a calibrated probability — there is not enough history yet for that. It is a
 * 0–100 score that combines the five signals the plan names, each of which is
 * independently useful, and none of which should dominate alone:
 *
 * 1. Days on market — a seller who has been asking for months is more likely to move.
 * 2. Number of prior cuts — someone who already cut once is in the game.
 * 3. Depth of prior cuts — a 2% trim is not the same as a 12% surrender.
 * 4. Multi-listed — three brokers on one apartment is itself a signal of urgency.
 *    Counted in publishers, not copies: one broker's ad copied to two portals is
 *    one broker.
 * 5. District inventory months — available from day one, before days-on-market is.
 *
 * Inventory months and multi-listing are the ones that work cold; days and cut
 * history take weeks to become informative. The score is a shortlist generator, not
 * a verdict, for the same reason the discount column is.
 */

export interface CutSignals {
  daysPublished: number | null;
  /** How many times the asking price has fallen across snapshots. */
  priceCutCount: number;
  /** Total relative drop from the first asking price to the current one, 0–1. */
  totalCutPct: number;
  /** Distinct publishers among the live copies of the property. */
  publisherCount: number;
  /**
   * Live listings divided by monthly sales rate in the district.
   * Null when there is not yet a sales rate to divide by.
   */
  inventoryMonths: number | null;
}

export interface CutScore {
  /** 0–100, higher means more likely to cut. */
  score: number;
  /** Which signals contributed, for the UI tooltip. */
  components: {
    days: number;
    cuts: number;
    depth: number;
    multiListed: number;
    inventory: number;
  };
}

/** Soft caps so a single extreme value cannot pin the score at 100. */
const DAYS_FULL = 120;
const CUTS_FULL = 3;
const DEPTH_FULL = 0.15;
const MULTI_FULL = 3;
const INVENTORY_FULL = 8;

/**
 * Score from the five signals.
 *
 * Weights favour inventory and multi-listing early on, when days and cut history
 * are still mostly noise. Once those mature they pull harder on their own, because
 * their full-scale values are rare.
 */
export function priceCutScore(signals: CutSignals): CutScore {
  const days =
    signals.daysPublished != null && signals.daysPublished > 0
      ? Math.min(1, signals.daysPublished / DAYS_FULL)
      : 0;
  const cuts = Math.min(1, Math.max(0, signals.priceCutCount) / CUTS_FULL);
  const depth = Math.min(1, Math.max(0, signals.totalCutPct) / DEPTH_FULL);
  const multiListed = Math.min(1, Math.max(0, signals.publisherCount - 1) / (MULTI_FULL - 1));
  const inventory =
    signals.inventoryMonths != null && signals.inventoryMonths > 0
      ? Math.min(1, signals.inventoryMonths / INVENTORY_FULL)
      : 0;

  // Weights sum to 1. Inventory and multi-list get a larger share because they
  // work on day one; days and cut history share the rest.
  const components = {
    days: 0.2 * days,
    cuts: 0.15 * cuts,
    depth: 0.15 * depth,
    multiListed: 0.25 * multiListed,
    inventory: 0.25 * inventory,
  };

  const score = Math.round(
    100 * (components.days + components.cuts + components.depth + components.multiListed + components.inventory)
  );

  return { score, components };
}

/** What tells two copies' publishers apart. */
export interface CopyPublisher {
  postingId: string;
  source: string | null;
  publisherId: string | null;
  publisherName: string | null;
}

function publisherNameKey(name: string | null): string | null {
  if (!name) return null;
  const key = name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
  return key || null;
}

/**
 * How many publishers the copies of one property have. The name decides,
 * because the two Navent portals give one publisher two different ids. Without
 * a name, the id within its source; without either, each copy is its own.
 */
export function distinctPublisherCount(copies: CopyPublisher[]): number {
  const keys = new Set<string>();
  for (const copy of copies) {
    const name = publisherNameKey(copy.publisherName);
    if (name) keys.add(`name:${name}`);
    else if (copy.publisherId) keys.add(`id:${copy.source ?? '?'}:${copy.publisherId}`);
    else keys.add(`posting:${copy.postingId}`);
  }
  return keys.size;
}

/**
 * Inventory months for a district: live listings / estimated monthly sales.
 *
 * Sales are approximated by listings that crossed into "possibly sold" recently.
 * Without a sales rate the signal is withheld rather than invented.
 */
export function inventoryMonths(input: {
  liveCount: number;
  soldLast90Days: number;
}): number | null {
  if (input.liveCount <= 0) return 0;
  if (input.soldLast90Days <= 0) return null;
  const monthlySales = input.soldLast90Days / 3;
  if (monthlySales <= 0) return null;
  return input.liveCount / monthlySales;
}

/**
 * Relative drop from the highest historical ask to the current one.
 *
 * Using the high-water mark rather than the first price catches the case where a
 * listing went up briefly and then came back down — the seller has still cut from
 * their peak, which is the psychologically relevant number.
 */
export function totalCutFromPeak(peakPen: number | null, currentPen: number | null): number {
  if (peakPen == null || currentPen == null || !(peakPen > 0) || !(currentPen > 0)) return 0;
  if (currentPen >= peakPen) return 0;
  return (peakPen - currentPen) / peakPen;
}
