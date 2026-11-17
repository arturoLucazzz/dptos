# Investor Numbers and Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each apartment in money that a beginner investor understands (monthly gain or monthly cost, cash on day one, total added, early-payment savings). Seed every screen with investor cases, and add a fast check for each scraper.

**Architecture:** The math stays pure in `lib/finance.ts` and a new `lib/prepayment.ts`. The browser computes it live from the panel in the URL, as today. The seed adds a pure case builder (`prisma/seed-cases.ts`) that writes through the real ingest, behind a database-name guard. `pnpm scrape:check` runs each registered adapter with a page cap and compares field fill rates with the saved fixtures.

**Tech Stack:** Next.js 16, React, nuqs (URL state), Prisma 7, Postgres, node:test with tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-investor-numbers-seed-design.md`

## Global Constraints

- All UI text is in Spanish.
- Free tools only.
- Keep the pure domain code in `lib/`. The finance math is computed live in the browser, never stored.
- Keep the existing tests green. Run `pnpm test`, `pnpm typecheck`, and `pnpm lint`.
- If rent does not cover the payment, show "Pones S/ X/mes" in plain words, never a positive %.
- The seed refuses any database whose name does not end in `_seed` or `_dev`.
- `scrape:check` reads one page per source.
- Database steps run only on `dptos_seed`. If it is missing, create it with `createdb -T dptos_plan dptos_seed`. Never touch `dptos`. Never read `.env`. Pass `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed` in the shell.
- Commit as the repository's configured user (arturoLucazzz). Do not push.

## Rulings made while planning

- The cash ("efectivo disponible") lives in the panel URL state (`efectivo`), next to Inicial, TEA, TCEA, and Plazo. It is not in the database `Assumptions` row. The spec says "in Assumptions, editable in the UI", and the panel is where the editable finance assumptions already live. Cost if wrong: one migration and one server action.
- If `efectivo` is empty, the table uses the Inicial % as today. If it has a value, cash mode applies to every row. Cost if wrong: one default value.
- `bankMinDownPaymentPct` is a fixed assumption with a new database column (default 20), like the other fixed assumptions.
- The early-payment amount is a panel field ("Amortización extra (S/ por mes)", URL `extra`), and its result is a table column. The current UI has no row detail view, and the redesign (piece 3) adds cards.
- Early-payment interest uses the TEA, because the TEA splits a payment into interest and principal.
- `scrape:check --save` writes the fresh cards to `data/checks/<source>-<YYYY-MM-DD>.json`, not to `__fixtures__`. The spec says "saves the fresh response as a new fixture". The adapters hand over parsed cards, not raw responses, and a replaced fixture changes the parse tests. Cost if wrong: one small change in each adapter to expose the raw response.

## Review Focus

1. Cash smaller than the purchase costs: the row shows "fuera de alcance", never a negative down payment or a loan larger than the price.
2. Cash larger than the price plus the costs: the loan is 0, the payment is 0, and the monthly gain is the net rent.
3. An early payment larger than the remaining balance: the loan ends that month, and no balance goes below 0.
4. A row without a rent estimate: the new columns show "—", and the row sorts last under `monthlyGain`.
5. The seed run with `DATABASE_URL` set to `.../dptos`: it stops before it writes anything, and the message names the database.

---

### Task 1: Cash-first loan, bank minimum, and monthly gain

**Files:**
- Modify: `lib/finance.ts`, `lib/finance.test.ts`, `lib/assumption-defaults.ts`, `lib/assumptions.ts`, `lib/listing-finance.ts`, `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_bank_min_down_payment/migration.sql`

**Interfaces:**
- Produces, in `lib/finance.ts`:
  - `FinanceAssumptions` gains `cashAvailablePen: number | null` and `bankMinDownPaymentPct: number`.
  - `loanFor(input: { pricePen: number; assumptions: FinanceAssumptions; purchaseCostsPen?: number }): Loan`. When `cashAvailablePen` is not null, the down payment is clamp(cash − purchaseCosts, 0, price). Otherwise the Inicial % path stays unchanged.
  - `Loan` gains `downPaymentPct: number` and `outOfReach: boolean`. `outOfReach` is true when the cash is below the purchase costs.
  - `ListingFinance` gains `monthlyGainPen: number` (net rent − TCEA payment, signed) and `yearlyGainPctOnCash: number | null`. The % is null when the gain is ≤ 0 or the cash on day one is 0. It also gains `totalAddedUntilCrossoverPen: number` and `belowBankMinimum: boolean`. `entryCostPen` stays, and it is the cash on day one.
  - `totalAddedUntilCrossover(input: { netRentPen: number; paymentPen: number; assumptions: FinanceAssumptions }): number`. Go year by year from year 1, with net rent growing at `rentGrowthPct`. Add `12 × max(0, payment − net)`. Stop at the first year where net ≥ payment, or after `termYears`.
  - `assumptionWarnings` returns `DOWN_PAYMENT_BELOW_BANK_MINIMUM` when `cashAvailablePen` is null and `downPaymentPct < bankMinDownPaymentPct`. The message is "La inicial está por debajo del mínimo que suelen pedir los bancos (X%)."
- Produces, in `lib/assumption-defaults.ts`: `DEFAULT_ASSUMPTIONS.bankMinDownPaymentPct = 20`. `PanelAssumptions` gains `cashAvailablePen: number | null` (default `null`) and `extraMonthlyPen: number` (default `0`, used by Task 3). `FixedAssumptions` gains `bankMinDownPaymentPct`.

- [ ] **Step 1: Write the failing tests** in `lib/finance.test.ts`. Add `bankMinDownPaymentPct: 20, cashAvailablePen: null` to `BASE`.

```ts
describe('cash-first loan', () => {
  const cash = { ...BASE, cashAvailablePen: 80_000 };
  it('pays purchase costs first, then the down payment', () => {
    const loan = loanFor({ pricePen: 400_000, assumptions: cash, purchaseCostsPen: 10_000 });
    assert.equal(loan.downPaymentPen, 70_000);
    assert.equal(loan.loanPen, 330_000);
    assert.equal(loan.downPaymentPct, 17.5);
    assert.equal(loan.outOfReach, false);
  });
  it('is out of reach when the cash does not cover the costs', () => {
    const loan = loanFor({ pricePen: 400_000, assumptions: { ...cash, cashAvailablePen: 5_000 }, purchaseCostsPen: 10_000 });
    assert.equal(loan.outOfReach, true);
    assert.equal(loan.downPaymentPen, 0);
  });
  it('needs no loan when the cash covers price and costs', () => {
    const loan = loanFor({ pricePen: 60_000, assumptions: cash, purchaseCostsPen: 5_000 });
    assert.equal(loan.loanPen, 0);
    assert.equal(loan.paymentPen, 0);
  });
});

describe('totalAddedUntilCrossover', () => {
  it('sums the yearly shortfall until rent overtakes the payment', () => {
    const total = totalAddedUntilCrossover({ netRentPen: 2_000, paymentPen: 2_500, assumptions: { ...BASE, rentGrowthPct: 3, termYears: 20 } });
    assert.ok(Math.abs(total - 26_583.93) < 0.01);
  });
  it('is 0 when rent already covers the payment', () => {
    assert.equal(totalAddedUntilCrossover({ netRentPen: 2_600, paymentPen: 2_500, assumptions: BASE }), 0);
  });
});

describe('listingFinance monthly gain', () => {
  it('never shows a % gain when the apartment costs money each month', () => {
    const f = listingFinance({ pricePen: 400_000, grossRentPen: 1_200, monthlyCostsPen: 300, purchaseCostsPen: 10_000, assumptions: { ...BASE, cashAvailablePen: 80_000 } });
    assert.ok(f.monthlyGainPen < 0);
    assert.equal(f.yearlyGainPctOnCash, null);
  });
  it('gives the net rent as the gain when there is no loan', () => {
    const f = listingFinance({ pricePen: 60_000, grossRentPen: 1_200, monthlyCostsPen: 200, purchaseCostsPen: 5_000, assumptions: { ...BASE, cashAvailablePen: 80_000 } });
    assert.equal(f.monthlyGainPen, f.netRentPen);
  });
  it('flags a down payment below the bank minimum', () => {
    const f = listingFinance({ pricePen: 400_000, grossRentPen: 1_800, monthlyCostsPen: 300, purchaseCostsPen: 10_000, assumptions: { ...BASE, cashAvailablePen: 50_000 } });
    assert.equal(f.belowBankMinimum, true);
  });
});
```

The existing test "warns about a down payment below what banks ask for" must pass with no change other than the new `BASE` fields.

- [ ] **Step 2: Run the tests and make sure that they fail.** Run: `node --import tsx --test lib/finance.test.ts`. Expected: FAIL (missing exports and fields).
- [ ] **Step 3: Implement** the interfaces above. `listingFinance` passes `purchaseCostsPen` to `loanFor`, and `loanForListing` in `lib/listing-finance.ts` passes the purchase costs too. Add the column `bankMinDownPaymentPct Decimal @db.Decimal(5,2) @default(20)` to `Assumptions`. Create the migration with `pnpm prisma migrate dev --create-only --name bank_min_down_payment` against `dptos_seed`, then apply it there with `pnpm prisma migrate deploy`. Read the column in `lib/assumptions.ts` and in `fixedFromDefaults`.
- [ ] **Step 4: Run** `pnpm test` and `pnpm typecheck`. Expected: all tests pass, including the finance test that fails on `main`.
- [ ] **Step 5: Commit:** `git commit -m "feat: cash-first loan, bank minimum warning, monthly gain per apartment"`

### Task 2: Early-payment simulator

**Files:**
- Create: `lib/prepayment.ts`, `lib/prepayment.test.ts`

**Interfaces:**
- Produces: `prepaymentSavings(input: { loanPen: number; teaPct: number; termYears: number; extraMonthlyPen: number }): PrepaymentSavings | null`. It returns null when `loanPen <= 0` or `extraMonthlyPen <= 0`.

```ts
export interface PrepaymentSavings {
  shorterLoan: { monthsSaved: number; interestSavedPen: number };
  lowerPayment: { paymentAfterOneYearPen: number; interestSavedPen: number };
}
```

- Shorter loan: each month, pay the level payment, then the extra amount capped at the balance. Count the months until the balance reaches 0.
- Lower payment: the same, but after each month the payment becomes the level payment of the balance over the remaining months. `paymentAfterOneYearPen` is that payment after month 12.
- Interest saved is the baseline interest (no extra) minus the interest of that mode.

- [ ] **Step 1: Write the failing tests** for a loan of S/ 300,000, TEA 8%, 20 years, and an extra S/ 500:

```ts
it('cuts the loan from 240 to 165 months and saves about S/ 102,160', () => {
  const s = prepaymentSavings({ loanPen: 300_000, teaPct: 8, termYears: 20, extraMonthlyPen: 500 })!;
  assert.equal(s.shorterLoan.monthsSaved, 75);
  assert.ok(Math.abs(s.shorterLoan.interestSavedPen - 102_160) < 1);
});
it('lowers the payment to about S/ 2,407.72 after one year', () => {
  const s = prepaymentSavings({ loanPen: 300_000, teaPct: 8, termYears: 20, extraMonthlyPen: 500 })!;
  assert.ok(Math.abs(s.lowerPayment.paymentAfterOneYearPen - 2_407.72) < 0.01);
  assert.ok(Math.abs(s.lowerPayment.interestSavedPen - 54_191) < 1);
});
it('ends the loan in the first month when the extra exceeds the balance', () => {
  const s = prepaymentSavings({ loanPen: 1_000, teaPct: 8, termYears: 20, extraMonthlyPen: 5_000 })!;
  assert.equal(s.shorterLoan.monthsSaved, 239);
});
it('returns null without a loan or without an extra amount', () => {
  assert.equal(prepaymentSavings({ loanPen: 0, teaPct: 8, termYears: 20, extraMonthlyPen: 500 }), null);
  assert.equal(prepaymentSavings({ loanPen: 300_000, teaPct: 8, termYears: 20, extraMonthlyPen: 0 }), null);
});
```

- [ ] **Step 2: Run** `node --import tsx --test lib/prepayment.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `prepaymentSavings` with `effectiveMonthlyRate` and `monthlyPayment` from `lib/finance.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat: early-payment savings, shorter loan and lower payment"`

### Task 3: Investor columns, panel fields, and default sort

**Files:**
- Modify: `components/assumptions-panel.tsx`, `lib/departamentos-search-params.ts`, `lib/departamentos-query.ts`, `lib/departamentos-query.test.ts`, `app/departamentos/departamentos-unified-client.tsx`, `app/departamentos/departamentos-table.tsx`, `app/favoritos/favoritos-client.tsx`, `lib/alerts.ts`

**Interfaces:**
- Consumes: the Task 1 `ListingFinance` fields and `PanelAssumptions`, and the Task 2 `prepaymentSavings`.
- Produces: the URL params `efectivo` (float, empty by default) and `extra` (float, default 0). The sort id `monthlyGain` in `DEPARTAMENTOS_SORT_IDS` becomes the default. `DepartamentosRow` gains `monthlyGainPen`, `yearlyGainPctOnCash`, `entryCostPen`, `totalAddedUntilCrossoverPen`, `belowBankMinimum`, `outOfReach`, and `prepayment: PrepaymentSavings | null`.

Copy (exact):
- Panel fields: "Efectivo disponible (S/)" and "Amortización extra (S/ por mes)".
- Gain column when positive: "Ganas S/ X/mes", and below it "X% al año sobre tu efectivo". When negative: "Pones S/ X/mes".
- "Efectivo inicial" shows `entryCostPen`. "Total que pones" shows `totalAddedUntilCrossoverPen`, or "S/ 0" when the gain is positive.
- Early-payment column, when `extra > 0`: "Terminas N años antes · ahorras S/ X". N is `monthsSaved / 12` with one decimal.
- Row badges: "Inicial bajo el mínimo del banco" when `belowBankMinimum`. "Fuera de alcance: tu efectivo no cubre los gastos de compra" when `outOfReach`.

- [ ] **Step 1: Write the failing tests** in `lib/departamentos-query.test.ts`. The default sort is `monthlyGain`, highest first. A row without a rent estimate sorts last, and its new fields are null. With `efectivo` set, `entryCostPen` equals the cash when the cash is below the price plus the costs.
- [ ] **Step 2: Run** `node --import tsx --test lib/departamentos-query.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the params, the sort, the row fields, the panel fields, the columns, and the badges. Every other caller of `PanelAssumptions` (`favoritos-client.tsx`, `lib/alerts.ts`) passes the new fields with their defaults.
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck`, and `pnpm lint`. Start `pnpm dev` with `DATABASE_URL` set to `dptos_seed`, open `/departamentos?efectivo=80000&extra=500`, and make sure that the new columns and badges show. Expected: all green, and the columns render.
- [ ] **Step 5: Commit:** `git commit -m "feat: investor columns, cash and extra payment in the panel, sort by monthly gain"`

### Task 4: Seed guard, full reset, and a smaller market

**Files:**
- Create: `lib/seed-guard.ts`, `lib/seed-guard.test.ts`
- Modify: `prisma/seed-market.ts`

**Interfaces:**
- Produces: `assertSeedDatabase(databaseUrl: string | undefined): string`. It returns the database name when the name ends in `_seed` or `_dev`. Otherwise it throws `Error('El seed solo corre en una base que termina en _seed o _dev. Base actual: <name>')`. A missing or unparseable URL also throws.

- [ ] **Step 1: Write the failing tests.** `dptos_seed` and `dptos_dev` pass. `dptos`, `dptos_plan`, `seed_dptos`, an empty URL, and `undefined` throw, and the message contains the name when one exists. A URL with a query string (`...dptos_seed?schema=public`) passes.
- [ ] **Step 2: Run** `node --import tsx --test lib/seed-guard.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `assertSeedDatabase`, and call it first in `main()` of `prisma/seed-market.ts`, before any query. `--reset` also deletes `DuplicateDecision`, `DuplicateCandidate`, and `Project` rows, in an order that respects the foreign keys. The default sizes become 200 sale and 100 rent units per district, and a `--units=<sale>,<rent>` flag overrides them. The formula verification must still pass at the new size.
- [ ] **Step 4: Run** `pnpm test`. Then run `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos pnpm db:seed:market --reset` and make sure that it stops with the guard message and writes nothing. Then run it against `dptos_seed`, and make sure that it finishes and prints the verification.
- [ ] **Step 5: Commit:** `git commit -m "feat: seed refuses non-seed databases, resets every table, runs smaller"`

### Task 5: Investor cases on every source, with a screen checklist

**Files:**
- Create: `prisma/seed-cases.ts`, `prisma/seed-cases.test.ts`
- Modify: `prisma/seed-market.ts`, `package.json` (add `"prisma/**/*.test.ts"` to the `test` script)

**Interfaces:**
- Consumes: `ListingCard` and `emptyCard` (`lib/listing-card.ts`), `ingestCards` (`scraper/src/db/ingest.ts`), the manual ingest that `createManualListing` in `app/agregar/actions.ts` calls after validation, and `listingFinance` with `DEFAULT_ASSUMPTIONS`.
- Produces: `buildInvestorCases(): InvestorCase[]`, a pure function.

```ts
export interface InvestorCase {
  id: string;            // e.g. 'ganga-lince'
  title: string;         // Spanish, shown in the checklist
  screen: string;        // e.g. '/departamentos', '/estadisticas', '/runs', '/agregar'
  lookFor: string;       // Spanish: what the owner sees on that screen
  cards: ListingCard[];  // one or more sources
  manual?: unknown;      // input for the manual ingest, when the case is a manual entry
}
```

Cases (the ids are fixed, and the data is left to the implementer):

| id | Case | Sources |
|---|---|---|
| `ganga-lince` | Under the fair price, and rent covers the payment with S/ 80k cash | urbania |
| `trampa-barata` | Low price per m², high maintenance, low rent: costs money each month | adondevivir |
| `copia-mas-barata` | One apartment on 3 sources, S/ 20k cheaper on one of them | urbania, adondevivir, proper |
| `vendedor-apurado` | Three price cuts over the seeded weeks | urbania |
| `proper-roi-distinto` | Proper unit whose own ROI in `raw` differs from ours | proper |
| `en-planos` | Project with only a "desde" price, delivery in 2027 | nexo |
| `aviso-facebook` | Manual entry with no link | manual |
| `pierde-plata` | Rent never covers the payment within the term | urbania |

- [ ] **Step 1: Write the failing tests** in `prisma/seed-cases.test.ts`. All 8 ids exist and are unique. Each case has at least one card or a manual input, a screen, and a Spanish `lookFor`. With `DEFAULT_ASSUMPTIONS` and `cashAvailablePen: 80_000`, `ganga-lince` has `monthlyGainPen > 0`, and `trampa-barata` and `pierde-plata` have `monthlyGainPen < 0`. `pierde-plata` has a null crossover year. `copia-mas-barata` has cards on 3 sources, and its lowest and highest prices differ by S/ 20,000.
- [ ] **Step 2: Run** `node --import tsx --test prisma/seed-cases.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `buildInvestorCases`. In `seed-market.ts`, ingest the cases after the market weeks. Each source card goes through `ingestCards` with its own `source`, on a run that records that source. The manual case goes through the manual ingest. At the end, print the checklist grouped by screen, with `id`, `title`, and `lookFor`.
- [ ] **Step 4: Run** `pnpm test`. Then run `DATABASE_URL=postgresql://arturoLucazzz@localhost:5432/dptos_seed pnpm db:seed:market --reset`. Open each checklist screen with `pnpm dev`, and make sure that each case shows as `lookFor` says. Record what you saw in the report.
- [ ] **Step 5: Commit:** `git commit -m "feat: investor cases on every source and a screen checklist in the seed"`

### Task 6: `pnpm scrape:check`

**Files:**
- Create: `scraper/src/check.ts`, `scraper/src/check-report.ts`, `scraper/src/check-report.test.ts`
- Modify: `scraper/src/sources/types.ts`, `scraper/src/sources/navent/adapter.ts`, `scraper/src/sources/proper/adapter.ts`, `scraper/src/sources/nexo/adapter.ts` and their tests, `package.json`, `README.md`

**Interfaces:**
- Produces: `crawl(opts)` accepts `maxPages?: number`. Navent stops after N result pages, Nexo after N list pages, and Proper after N project fetches. A capped crawl is not an error.
- Produces, in `scraper/src/check-report.ts`: `fillRates(cards: ListingCard[]): FillRates`, with the keys `price`, `area`, `bedrooms`, `address`, and `coordinates` (shares from 0 to 1). Also `checkSource(input: { cards: ListingCard[]; baseline: FillRates }): { pass: boolean; reasons: string[] }`. It fails when there are 0 cards, or when a rate is more than 0.2 below the baseline.
- `scraper/src/check.ts` runs `pnpm scrape:check <source|all> [--save]`. Defaults: Lince, sale, `maxPages: 1`. The baseline is the fill rate of that source's fixture, parsed with `parseNaventPostings`, `parseProperProject`, or `parseNexoListPage`. Remax prints "remax: pendiente (Cloudflare Turnstile)", and that is not a failure. The command uses no database and needs no `DATABASE_URL`. The exit code is 1 when any source fails.

- [ ] **Step 1: Write the failing tests.** `fillRates` on 4 cards with 3 prices gives `price: 0.75`. `checkSource` fails with 0 cards ("0 avisos"). It fails when the area rate drops from 0.9 to 0.6 ("área: 60% vs 90%"), and it passes at 0.75 vs 0.9. Each adapter test gets one case: with `maxPages: 1` and fake deps that hold 3 pages, the adapter fetches 1 page.
- [ ] **Step 2: Run** `node --import tsx --test scraper/src/check-report.test.ts scraper/src/sources/*/adapter.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `maxPages`, the report, and the command. Add the script `"scrape:check": "tsx scraper/src/check.ts"` with no env file. Add a short README section, "Probar una fuente", that shows `pnpm scrape:check all`.
- [ ] **Step 4: Run** `pnpm test`, then `pnpm scrape:check all`. Expected: the tests pass. Each live source prints its card count, its fill rates, and PASS, and the whole run takes under 2 minutes.
- [ ] **Step 5: Commit:** `git commit -m "feat: scrape:check reads one page per source and compares fill rates"`
