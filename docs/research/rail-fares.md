# Train fares: LRT-1, LRT-2, MRT-3

Researched 2026-10-02 for the train lines (the owner's "real train fares,
shown by station like jeep fares"). What `src/shared/model/railFares.ts`
holds, and where each number comes from. `tests/unit/rail-fares-test.mjs`
checks the module against every cell of the tables below, kept in
`tests/unit/fixtures/rail-fares-official.json`.

## Two fares a ride

Each line charges a beep card (stored value) fare and a single journey
ticket fare, the ticket the same or more. The trip card shows them as a
range, card to ticket, in whole pesos like every fare it shows: LRT-2's
₱16.50 card fare reads ₱16 and its ₱18 ticket ₱18, so `₱16–18`.

## LRT-1 (LRMC)

- Effective 2025-04-02; announced as ₱16.25 boarding + ₱1.47 a km. The
  formula does not reproduce the published matrix (260 of 300 pairs), so
  the matrix is what is stored.
- Stored value matrix: lrmc.ph, fare matrix page, image "New SVC fare
  matrix effective April 2, 2025" (the site's two file names are swapped:
  the SVC file is titled Single Journey, the SJT file Stored Value).
  Both triangles were read independently; no asymmetries.
- Single journey = the card fare rounded up to the next ₱5, never under
  ₱20. Checked against the whole single journey matrix.
- Checks: Dr. Santos–Fernando Poe Jr. card ₱52, ticket ₱55 (Rappler,
  "end-to-end tickets to cost ₱55"); Dr. Santos–Ninoy Aquino Avenue ₱19/₱20.
- No general half fare on LRT-1 (LRMC: "standard fare rates still apply").

## LRT-2 (LRTA)

- Base matrix effective 2023-08-02 (lrta.gov.ph, Fare Matrix Line 2).
  Single journey = card fare up to the next ₱5.
- From 2026-03-23, DOTr's 50% for all LRT-2 and MRT-3 passengers, "until
  further notice" (lrta.gov.ph, Tickets and Fares): card = half to the
  centavo (₱6.50–16.50), ticket = half rounded up to a peso (₱8–18). Both
  checked against LRTA's "Fare Matrix Discounted 50%".

## MRT-3 (DOTr)

- Since 2015-01-04, by stations travelled, card and ticket the same
  (mrt3.com fare guide): 1–2 ₱13, 3–4 ₱16, 5–7 ₱20, 8–10 ₱24, 11–12 ₱28.
- From 2026-03-23, half: ₱6, 8, 10, 12, 14 (DOTr's student half-fare
  matrix, half rounded down). The all-passenger 2026 matrix image could
  not be fetched; reports give the minimum as ₱6 (PNA) or ₱6.50, so a
  card fare of ₱6.50 is possible. Unverified.

## Discounts

- 50% for students (since 2025-06-20) and seniors and PWDs (since
  2025-07-16) on all three lines, with a white beep card or ID. Not the
  jeeps' 20%.
- On LRT-2 and MRT-3 the two halves do not stack: a discounted rider pays
  the same as everyone while the half fare lasts (LRTA's page; Tribune).
  Moderate confidence.
- LRT-1 discounted: card half to the centavo, ticket half rounded up
  (student tickets ₱10–28, TopGear 2025). How LRT-1 rounds a white card's
  half is not published.

## When it changes

The half fare on LRT-2 and MRT-3 can end without notice. `HALF_FARE_FROM`
starts it; to end it, add the date it ends and keep the base tables, which
are stored whole for that reason.
