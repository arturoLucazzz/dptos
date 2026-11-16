# Investor numbers and seed

Date: 2026-11-16. Status: approved by the owner.

This document is piece 1 of 4. The order is: 1. investor numbers and seed, 2. location score, 3. UI redesign with map and cards, 4. AI chat and access for other investors.

## Intent

The platform is built for investors (README, "Nuestro mantra"). An investor wants to know which apartment gives the most value for the money. Proper shows "TIR anual" and "Rent. anual". The owner is a beginner investor and says that these numbers mean nothing to a beginner. This piece shows the numbers in money that a beginner understands:

- how much you win each month, and that gain as a % of your cash
- how much you add from your own pocket
- how many years and how much interest an extra monthly payment saves

It also makes the seed test every screen with investor cases, and it gives a quick way to test each scraper.

## Goals

- The owner enters the cash available ("efectivo disponible"), and every apartment is computed from that cash.
- Each apartment shows its monthly gain or the money you add, and the cash on day one.
- Each apartment shows the total that you add until rent overtakes the payment.
- The ranking sorts by monthly gain by default.
- An early-payment simulator shows the years and the interest saved.
- The seed fills every screen with investor cases across all sources.
- `pnpm scrape:check <source>` tells in seconds whether a scraper still works.

## Non-goals

- The location score (piece 2), the map and the cards (piece 3), and the AI chat (piece 4).
- A new UI. The new numbers show in the current UI.
- IRR ("TIR") or total return with price growth.

## Anti-goals

- A flattering number. If rent does not cover the payment, the apartment shows a monthly cost in plain words, never a positive %.
- A seed that deletes real data. The seed refuses to run on a database whose name does not end in `_seed` or `_dev`.
- A check that sends many requests. `scrape:check` reads one page per source.

## Constraints

- Keep the stack and the pure domain code in `lib/`. The math stays in `lib/finance.ts` and is computed live, because the owner's settings change it.
- All UI text is in Spanish.
- Free tools only.
- Keep the existing tests green. The test "warns about a down payment below what banks ask for" fails today, because the warning is missing from `assumptionWarnings`. This piece brings the warning back.

## Approaches

- Extend `lib/finance.ts` and compute in the client, as today. Chosen.
- A separate finance service. Rejected: the math already lives in `lib/finance.ts`.
- Store ROI in the database. Rejected: the owner's settings change it, so it must stay live.

## Design

### Cash first

A new setting, `cashAvailablePen` ("efectivo disponible"), in `Assumptions`, editable in the UI. For each apartment:

1. The cash pays the one-off purchase costs first.
2. The rest is the down payment, capped at the price.
3. The loan is the price minus the down payment.

If the down payment is below the bank minimum, the apartment shows a warning. The bank minimum is a setting, `bankMinDownPaymentPct`. If the cash does not cover the purchase costs, the apartment shows that it is out of reach.

### Numbers per apartment

- Monthly gain: net rent (after maintenance, vacancy, and income tax) minus the mortgage payment at TCEA. If it is positive, show "Ganas S/ X/mes" and the yearly gain as a % of the cash on day one. If it is negative, show "Pones S/ X/mes".
- Cash on day one: down payment plus purchase costs.
- Total added: the sum of monthly contributions until rent overtakes the payment, using the existing rent growth assumption.
- The ranking sorts by monthly gain, highest first.

### Early payments

The owner enters an extra amount per month. The simulator shows two results:

1. Shorter loan (shown first, because it saves more interest): the years cut and the interest saved.
2. Lower payment: the new monthly payment and the interest saved.

Peruvian banks must accept early payments without a penalty.

### Seed

- `prisma/seed-market.ts` keeps the price formula as the reference market. It becomes smaller and faster.
- New investor cases, written through the real ingest, on all sources (Urbania, Adondevivir, Proper, Nexo, manual):
  - a real bargain: under the fair price, and rent covers the payment
  - a cheap trap: low price per m², but high maintenance and low rent
  - the same apartment cheaper on another source, which is the negotiating anchor
  - a seller who cuts the price again and again
  - a Proper unit where Proper's own ROI differs from ours
  - a project under construction with only a "desde" price
  - a manual entry from Facebook
  - an apartment that costs you money every month
- The seed refuses any database whose name does not end in `_seed` or `_dev`.
- `--reset` also clears `Project`, `DuplicateCandidate`, and `DuplicateDecision`.
- The seed ends with a checklist: each screen, and the rows to open to see each case.

### scrape:check

`pnpm scrape:check <source>` and `pnpm scrape:check all`. For each source: one district and one page, no database. It prints the number of cards and the share of cards with price, area, bedrooms, address, and coordinates. It also prints PASS or FAIL against the shape of the saved fixtures. A flag saves the fresh response as a new fixture.

## Calls made by the designer

- The cash pays the purchase costs before the down payment.
- The default `bankMinDownPaymentPct` is 20%, which is common for an investment purchase. The owner can change it.
- The % gain is the yearly gain divided by the cash on day one.
- The default sort is the monthly gain.
- Shorter loan shows before lower payment.
- The seed database names end in `_seed` or `_dev`.

## Left to the builder

- The exact seed sizes and the case data.
- Where the new numbers go in the current table.
- The district and page that `scrape:check` uses for each source.
- The Remax case in `scrape:check`: report it as deferred, not as a failure.
