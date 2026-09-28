# LTFRB jeepney fares, and how ParaPo could use them

Researched 26 September 2026. Fares change often. Check the history section before relying on any number here.

**Source labels used below:**

- **Primary**: LTFRB's own fare guides, the laws themselves, or PNA (the government news agency).
- **Secondary**: a news outlet. A number that only appears in a secondary source is marked as such.

## Summary

**The fare changes in two days.** On 25 September 2026 the Transportation Secretary approved LTFRB's recommendation. It lifts the suspension of the March 2026 fare increase, and the new fares start **Monday, 28 September 2026**. Until then, the October 2023 fares are still in force.

| | Minimum fare (first 4 km) | Each km after 4 | Student / senior / PWD, first 4 km |
|---|---|---|---|
| **In force today (since 8 Oct 2023)** | | | |
| Traditional PUJ | ₱13.00 | ₱1.80 | ₱10.50 (₱10.40 before rounding) |
| Modern PUJ, aircon (also covers electric) | ₱15.00 | ₱2.20 | ₱12.00 |
| Modern PUJ, non-aircon (also covers electric) | ₱15.00 | ₱1.80 | ₱12.00 |
| **From 28 Sep 2026 (secondary sources, see below)** | | | |
| Traditional PUJ | ₱14.00 | ₱2.00 | not published yet (the old method gives ₱11.25) |
| Modern PUJ | ₱17.00 | ₱2.40, **or ₱2.30** (sources disagree) | not published yet (the old method gives ₱13.50) |

- **Today's rows** are read directly from LTFRB's three official fare guides (see [Fare guides](#the-2023-fare-guides-primary)).
- **The 28 September rows** come from news reports of the DOTr approval. I could not reach LTFRB's new fare guide PDFs, because the site blocks automated access. Those reports also do not say what happens to *non-aircon* modern jeeps.

## Update, 28 September 2026: the official guide, read

The owner supplied LTFRB's new **PUJ General Fare Guide** (effective 28
September 2026) on the day itself. It confirms **₱14.00 for the first 4 km
and ₱2.00 per succeeding km**, prints the discount rule unrounded ("First
Four (4) kilometers = P 11.20 / Succeeding kilometers = Additional P 1.60
per kilometer" — 80% of the regular rule; the table's own rows round to
₱0.25, first 4 km **₱11.25**), and repeats hotline 1342 and the MC 2017-024
everyday-discount note. §1.1's formula reproduces **all 50 printed rows
exactly**, both columns; `scripts/fares-test.mjs` carries the table. The
modern-PUJ guide is still unread (₱2.30/₱2.40 unsettled) and parked: the
owner scoped fares to traditional jeeps (28 Sep 2026).

## 1. The fare rules

### 1.1 How a fare is built

LTFRB calls this the **"add-on method"**. You pay a flat minimum for the first 4 km. Then you pay a fixed amount for each kilometre after that. Each fare guide spells it out, for example: "First Four (4) kilometers = P 13.00 / Succeeding kilometers = Additional P 1.80 per kilometer" ([traditional PUJ fare guide, effective 8 Oct 2023][fg-trad]).

So, for a trip of *k* whole kilometres:

```
regular fare    = round to nearest ₱0.25 ( minimum + perKm × max(0, k − 4) )
discounted fare = round to nearest ₱0.25 ( 0.8 × minimum + 0.8 × perKm × max(0, k − 4) )
```

**I checked this formula against all 150 rows** of the three 2023 fare guides (50 km each). It reproduces every row exactly. Two details:

- **The discount is taken before rounding.** It is 20% off the *unrounded* fare, and then the result is rounded. It is not 20% off the rounded regular fare. The guides print the discounted rule as its own line: "First Four (4) kilometers = P 10.40 / Succeeding kilometers = Additional P 1.44 per kilometer" ([fg-trad]).
- **An exact tie never happens with these rates**, so the tie-breaking direction (up or down) cannot be tested. A code version should round half up and say so.

Worked example, traditional PUJ, 7 km:

- Regular: 13 + 1.80 × 3 = 18.40, which rounds to **₱18.50**.
- Discounted: 10.40 + 1.44 × 3 = 14.72, which rounds to **₱14.75**.

The guide shows 18.50 and 14.75 ([fg-trad]).

### 1.2 Rounding

- Every current fare guide carries the note: **"NOTE: Fares are rounded off to the nearest 25 centavos"** ([fg-trad], [fg-mod-ac], [fg-mod-nac]).
- The rule is old. LTFRB's 1996 joint decision on jeepney fares said: "Fares shall be rounded off to the nearest multiple of P25 centavos, i.e. a fare of P4.60 shall be rounded off to P4.50 while a fare of P4.95 to P5.00" ([LTFRB joint decision, 11 Nov 1996, Supreme Court E-Library][jd-1996]).
- "Nearest" can round **down**. For example, ₱14.80 becomes ₱14.75 and ₱11.84 becomes ₱11.75.

### 1.3 Partial kilometres: not found

- The fare guides list **whole kilometres only** (1 to 50). They do not say how a 5.3 km ride is counted: as 5 km, as 6 km, or rounded to the nearest km ([fg-trad]).
- I found no LTFRB text that answers this. **Treat it as unknown.** Do not assume "always round up".
- This matters for ParaPo (see §4.3). It is a good question for LTFRB's hotline, **1342**, which is printed on every guide.

### 1.4 Traditional, modern and electric

- LTFRB publishes **three** jeepney fare guides, not two ([fg-trad], [fg-mod-ac], [fg-mod-nac]):
  - **"PUJ General Fare Guide"**, labelled **"Mega Manila"**. This is the traditional jeepney.
  - **"Aircon Modern and Electric PUJ General Fare Guide"**
  - **"Non-Aircon Modern and Electric PUJ General Fare Guide"**
- So **e-jeepneys are not a separate fare class.** They use the modern guide that matches whether they have aircon.
- Modern aircon and modern non-aircon have the **same ₱15 minimum**. They differ only per km: ₱2.20 against ₱1.80.
- A non-aircon modern jeep's per-km rate equals a traditional jeep's. Only the minimum differs (₱15 against ₱13).

### 1.5 Discounts: students, senior citizens, PWDs

**Three laws give the 20% fare discount:**

- **Senior citizens (RA 9994, 2010).**
  - Section 4(a)(5) gives the discount "in actual fare for land transportation travel in public utility buses (PUBs), public utility jeepneys (PUJs), taxis, Asian utility vehicles (AUVs), shuttle services and public railways".
  - A senior citizen is "any resident citizen of the Philippines at least sixty (60) years old" (Sec. 2(a)).
  - Approved 15 Feb 2010 ([RA 9994 on Lawphil][ra9994]).
- **Persons with disability (RA 10754, 2016).**
  - It amends RA 7277, Sec. 32(a)(7): the discount applies "on actual fare for land transportation travel such as, but not limited to, public utility buses or jeepneys (PUBs/PUJs), taxis…".
  - Approved 23 Mar 2016 ([RA 10754 on Lawphil][ra10754]).
- **Students (RA 11314, Student Fare Discount Act, 2019).**
  - 20% off regular fares on buses, jeepneys, taxis, tricycles, trains, aircraft and ships. School shuttles and charters are excluded.
  - Valid "during the entire period while the student is enrolled, including weekends and holidays".
  - Post-graduate students and short informal courses are excluded.
  - Approved 17 Apr 2019 ([RA 11314 on Lawphil][ra11314]).

**Discounts do not stack.** RA 11314 Sec. 6 says the student discount "shall not be claimed if the student claims a higher discount … or in combination with other discount programs" ([ra11314]). A student who is also a PWD gets one 20% discount, not 40%.

**The discount applies every day.** The fare guides repeat that students get "not less than 20% of the approved adjusted fare EVERYDAY, including Saturdays, Sundays and Holidays as per MC 2017-024" ([fg-trad]). The older LTFRB rule that limited students to school days was MC 94-001, from 13 Jan 1994 ([MC 94-001, SC E-Library][mc94]). That rule has been replaced.

**How it is computed:** see §1.1. The discounted fare is 80% of the unrounded fare, rounded to the nearest ₱0.25.

### 1.6 A new fare applies only once it is posted

- LTFRB has long held that operators must post the approved fare matrix inside the jeep before charging a new fare.
- For the 28 September 2026 change, LTFRB repeated this: display the updated fare guide before charging the new fare. Commuters can report violations to hotline 1342 or LTFRB's Facebook page ([Abante, 26 Sep 2026 — secondary][abante-matrix]).
- The DOTr approval says the same, per [Manila Times, 25 Sep 2026 — secondary][mt-sep25].
- **For the next few weeks, some jeeps will legally charge the old fare and some the new one.**

## 2. Recent fare orders, newest first

| Date | What happened | Source |
|---|---|---|
| **28 Sep 2026** | New fares take effect: traditional ₱14 + ₱2.00/km; modern ₱17 + ₱2.40/km (one agency report says ₱2.30). | [Manila Times][mt-sep25], [Abante][abante-sep25] — secondary |
| 25 Sep 2026 | Acting DOTr Secretary Giovanni Lopez approves LTFRB's recommendation to lift the March suspension. It is approved by a DOTr memorandum dated 25 Sep 2026, and it is not called provisional. PIA (government) also ran the story, but its page was unreachable. | [Manila Times][mt-sep25] — secondary; [PIA][pia-sep] (unreachable) |
| 22–23 Sep 2026 | Suspension still in place. Bus operators ask the Palace to lift it. An LTFRB official says a recommendation is coming "by October". The 25 Sep approval came sooner. | [BusinessMirror][bm-sep23], [The Chronicle][chron-sep22] — secondary |
| 22 Jul 2026 | Lopez orders LTFRB to begin public consultations on the pending petitions. LTFRB says it will issue "a final resolution" rather than an interim adjustment. | [PNA 1280053][pna-jul22] |
| 3 Jun 2026 | The suspension is still in force. A Baguio drivers' group mentions a "voluntary" higher fare that riders may choose to pay; the official minimum is still ₱13. | [PNA 1276494][pna-jun3] |
| **18 Mar 2026** | President Marcos orders the fare increase suspended for all land public transport, nationwide, the day before it was to start. DOTr implements this for traditional and modern jeepneys, buses, P2P, TNVS and airport taxis, "while the oil crisis … is ongoing". | [PNA 1271322][pna-mar18a], [PNA 1271338][pna-mar18b] |
| 17 Mar 2026 | LTFRB announces increases for 19 Mar: traditional ₱13 to ₱14, +₱2.00/km; modern ₱15 to ₱17, per km ₱2.30 (PNA) or ₱2.40 (GMA, BusinessWorld). Described as provisional, to become permanent once operators secure a fare matrix "before June". It never took effect. | [PNA 1276494][pna-jun3]; [GMA][gma-mar17] — secondary |
| 5 Dec 2025 | LTFRB: no fare increase after a large oil price rollback. Minimum stays at ₱13 traditional and ₱15 modern. | [PNA 1264715][pna-dec5] |
| 7 Nov 2025 | LTFRB consolidates more than 37,000 fare petitions; groups ask for up to ₱5 plus ₱1/km. | [PNA 1262809][pna-nov7] |
| 12 Aug 2025 | Petition for a ₱15 traditional minimum filed. | [PNA 1256378][pna-aug12] |
| **8 Oct 2023** | ₱1 provisional increase to the **first 4 km only**: traditional ₱12 to ₱13, modern ₱14 to ₱15; per-km rates unchanged. Nationwide. It comes from an LTFRB Order dated 3 Oct 2023. It was still provisional as of late 2025, and **it is the fare in force until 28 Sep 2026**. | [PNA 1211067][pna-2023]; fare guides [fg-trad], [fg-mod-ac], [fg-mod-nac] |
| 4 Oct 2022 | Traditional ₱11 to ₱12, per km ₱1.50 to ₱1.80; modern ₱14, per km ₱1.80 to ₱2.20. A later PNA headline gives the start date as 3 Oct, so the exact date is unclear. | [PNA 1183909][pna-2022], [PNA 1184136][pna-2022b] |

**Metro Manila only, or regional?**

- The 2023 increase and the 2026 suspension were both **nationwide** ([PNA 1211067][pna-2023], [PNA 1271322][pna-mar18a]).
- But the traditional fare guide is labelled **"Mega Manila"** ([fg-trad]). I could not find the guides for other regions, so I cannot say whether their per-km rates match.
- For ParaPo, which is Metro Manila only, the Mega Manila guide is the right one either way.

**Things I could not confirm:**

- **The modern per-km rate from 28 Sep: ₱2.40 or ₱2.30.**
  - ₱2.30: PNA (reporting the March figures) and TopGear ([topgear-mar17]).
  - ₱2.40: GMA, BusinessWorld, Manila Times, Abante and the Inquirer (via search results).
  - LTFRB's own new fare guide would settle it; I could not reach it.
- **The new modern non-aircon rate.** No report separates aircon from non-aircon.
- **The new discounted fares.** None were published in what I could read. Applying the 2023 method gives ₱11.25 (traditional) and ₱13.50 (modern) for the first 4 km, but these are my calculation, not LTFRB's.
- **Any resolution or memorandum-circular number** for the 2026 orders. News reports cite only "a DOTr memorandum dated 25 September".

## 3. How LTFRB publishes fares

- **Format.** Each fare guide is a **one-page PDF**: a table of 1 to 50 km, with a "Regular" and a "Student / Elderly / Disabled" column. Below the table is the add-on rule in words. The 2023 guides are at:
  - `ltfrb.gov.ph/wp-content/uploads/2024/11/Fare-Guide_Traditional-PUJ-Provisional-Fare-Increase_08Oct2023.pdf` ([fg-trad])
  - `…/Fare-Guide_Modernized-Aircon-Provisional-Fare-Increase_08Oct2023.pdf` ([fg-mod-ac])
  - `…/Fare-Guide_Modernized-Non-Aircon-Provisional-Fare-Increase_08Oct2023.pdf` ([fg-mod-nac])
  - LTFRB also has a "Fare rates" page ([ltfrb.gov.ph/fare-rates/][ltfrb-rates]).
- **Machine-readable?** Partly.
  - The PDFs contain real text, not scanned images. `pdftotext` pulls every row out cleanly.
  - There is no CSV, JSON or API.
  - The site sits behind a Cloudflare bot check that blocks scripts and non-browser fetches. Every direct fetch in this research got HTTP 403. I read the 2023 guides from the Internet Archive's copies.
  - **So an automatic nightly fetch from LTFRB would not work.** Fares have to be entered by hand when LTFRB changes them. That is a few numbers every year or two.
- **You don't need the table.** Because the table is exactly "minimum + per-km, rounded to ₱0.25", ParaPo can store **five numbers per fare class**: minimum, km covered by the minimum, per-km, discount rate, rounding step. It can then rebuild any row.
- **Earlier work.** Sakay.ph's makers noticed the same formula in 2013 and reported "some discrepancies with the discounted jeep fares". The 2023 guides show none ([Pleasant Programmer, "Fare Data", 2013 — secondary][pp-2013]).

## 4. How ParaPo could use this

**What exists already:**

- `route.fare_note` is free text, set in the Save panel and shown on the route card as "Fare".
- `route.fare_as_of` is a date column in the database (`supabase/migrations/0001_init.sql`). It is not in `RouteSummary` and not published.
- PLAN.md lists "the LTFRB fare matrix, for consistent `fare_note`" as a non-code need.
- PLAN.md's linear-referencing notes say "jeepney fare *is* distance", and list "fare stage" as an annotation kind.
- The feature bank's **F15** covers what other apps do and the general risks. This section adds only what is specific to ParaPo's data.

### 4.1 Where the error comes from

A computed fare has three parts. Only the distance is ParaPo's own.

1. **The rule** (minimum, per-km, rounding) is official. It is exact, but it changes by date: there are two rules this very week.
2. **The fare class**: traditional, modern aircon, or modern non-aircon.
   - Fare class belongs to **the jeep, not the route**. One route can run both old and modern units.
   - ParaPo's `mode` today is `jeepney` or `e_jeepney`. That split does not match LTFRB's classes, because an e-jeepney may or may not have aircon.
3. **The distance** is the length of our drawn line (`lineLength` over `travelLine`). It differs from what a driver or LTFRB would count, for four reasons:
   - The line is snapped to OSM road centrelines. A jeep drives in a lane, U-turns, and enters and leaves terminals. These are small but real extra metres, mostly at the ends.
   - Straight segments between points cut corners. The drawn length tends to come out slightly *shorter* than the true one.
   - The line is where *we* saw the jeep go. Short turns and shortcuts change the real distance on the day.
   - Nobody (not LTFRB, not the driver) measures a rider's trip to the metre. The fare guide is in whole km. How a partial km is counted is unknown (§1.3).

**What this means in pesos:**

- **Any trip of 4 km or less costs exactly the minimum.** It is ₱13 today (₱14 from 28 Sep) for a traditional jeep, whatever small error the line has. Short trips are safe.
- **Beyond 4 km, each whole km adds ₱1.80** (₱2.00 from 28 Sep). After rounding to ₱0.25, one km more or less moves the fare by ₱1.75 to ₱2.00.
- A 2% length error on a 10 km ride is 200 m. That flips the fare only when the true distance is within 200 m of a km boundary. On average, a meaningful share of long trips would be one step off.
- **The unknown partial-km rule is a bigger risk than the line error.** "Round up" against "round down" is always a full km's difference.

**Suggested honesty rules** (for any option that shows a peso amount):

- **Label every computed amount as an estimate, and say what it is based on.** For example: "Estimate · LTFRB fare guide effective 8 Oct 2023 · distance from ParaPo's drawn line". Keep the same wording everywhere.
- **Show a range when the distance is near a km boundary**, or show the two fares on either side. Don't pretend one number is certain. A simple test: if rounding the distance down and rounding it up give different fares, show both.
- **Never show an estimate below the minimum fare.**
- **Show the discounted fare next to the regular one.** It is a legal right, and it costs nothing to show.
- **Around a fare change** (like 28 Sep 2026), say that some jeeps may still charge the old fare until they post the new matrix (§1.6). Or show both for a few weeks.
- **Let `confidence` carry through.** A `drawn` direction's estimate is weaker than a `verified` one. That could mean a wider range or a softer label. How to show it is the owner's design call.
- **Never let the fare wording turn hintuans into "the stops".** Say "from where the jeep leaves", "to about here" or "to [place]". A fare *to* a hintuan must not read as "you can only get off here".
- **Never frame an estimate as proof that a driver overcharged.** The feature bank's F15 already flags the trust risk.

### 4.2 Options, smallest to largest

**Option A. One fare rule, shown as words (no computed number)**

- *What it shows:* On the route card, the rule for the jeep type, for example: "₱13 for the first 4 km, then ₱1.80 per km. 20% off for students, seniors and PWDs." Plus the fare guide's date.
- *What it needs:*
  - A small `fares` table in the published file, not per route. One entry per fare class, each with: `class` (traditional / modern-aircon / modern-non-aircon), `minimum`, `minimumKm` (4), `perKm`, `discount` (0.2), `roundTo` (0.25), `effectiveFrom`, and `source` (the guide's name and URL).
  - Keep the old entry when a new one arrives, so the history is kept and the next change is just one added row.
  - Routes need to know their fare class. That can be a default: "jeepney" means traditional.
- *Honesty:* No distance is involved, so no estimate. This is the safest option.
- *Effort:* Tiny.
- *It also fixes PLAN.md's "consistent `fare_note`" item:* the owner types only exceptions, such as "drivers here charge ₱15 flat".

**Option B. Whole-direction fare**

- *What it shows:* Beside the existing "Length", the estimated fare from end to end, regular and discounted. For example: "Estimate ₱22–23.75, discounted ₱17.50–19" when the length is near a km boundary.
- *What it needs:*
  - Option A.
  - A pure function `fareFor(meters, fareRule)` returning `{ regular, discounted, low, high }`, which is easy to unit-test against the 150 rows checked in §1.1.
  - `lineLength` already exists.
- *Honesty:* All of §4.1. This is useful mostly for long routes. For a route under 4 km it simply equals the minimum.

**Option C. Fare to each place on the timeline**

- *What it shows:* In the timeline, next to each hintuan and the far end, "about ₱X from [where it leaves]".
- *What it needs:*
  - Option B.
  - **Metres along the line to each hintuan.** `hintuansAlong` today gives a *vertex index*, not metres. Summing `lineLength` up to that index gives a first version. PLAN.md's M8 (linear referencing, `shape_dist_traveled`) is the proper home.
  - Pick a fixed point in each hintuan's box to measure to, such as where the line enters it (`entryDistance` exists).
- *Honesty:*
  - A rider rarely boards at the head. "From [head]" must be explicit.
  - The fare must not make the hintuans read as the only places to get off. This is the owner's main rule.
  - Showing it only on demand (collapsed) keeps the timeline a list of places, not a price list.
- *Open:* Only from the head, or also between any two rows?

**Option D. Fare between any two points**

- *What it shows:* The rider marks where they get on and where they get off, anywhere along the line. They get an estimate for that stretch.
- *Why it fits:* This matches "a jeep stops anywhere", because the points are free, not tied to hintuans. It is the natural partner of the feature bank's one-ride finder (F04).
- *What it needs:* Option B, snapping a tapped point onto the direction's line (M8), and the metres between the two points.
- *Honesty:* Same as B. Also, the rider's own points are imprecise by tens of metres, so the range rule matters more here.
- *Cost:* This is interactive UI, the largest piece.

**Option E. Fares people actually paid ("fare stages")**

- *What it shows:* The owner records fares seen or asked on the ground. For example: "Tala → Malaria: ₱13, asked the driver, 2026-09-20".
- *What it needs:* PLAN.md's annotation model (a stretch plus a kind, anchored to real coordinates). "Fare stage" is already listed as a kind. It also needs a date and a provenance, in the same spirit as `confidence`.
- *Why it matters:* This is ground truth, ParaPo's strength. It can sit next to the computed estimate. Where the two disagree, show both and say which is which: official rule, or what riders pay.
- *Cost:* Fieldwork, and the owner must keep it current.

Options A and B can ship with today's data. C and D wait for M8 (metres along the line). E waits for the annotations work.

### 4.3 Open questions for the owner

1. **Which fare class is each route?** Traditional, modern aircon, modern non-aircon, or mixed?
   - A route that runs both old and new jeeps has two fares.
   - Should this be a field on the route? Should mode `e_jeepney` gain an aircon/non-aircon choice? Or should the card show both classes?
2. **A number, or only the rule?** Is Option A (the rule in words) enough for now? If you want a computed peso amount (B to D), how should uncertainty look?
   - A range near km boundaries?
   - A single number with "estimate"?
   - Hide it for `drawn` directions?
   - This is a design call for Figma.
3. **How are partial kilometres counted?** Nobody published this (§1.3). Options:
   - Ask LTFRB (hotline 1342, or their Facebook page).
   - Ask a few drivers.
   - Show both sides of the boundary until it's known.
4. **Who changes the numbers when LTFRB does, and when?**
   - The next change is **28 Sep 2026**.
   - Should the published file carry both rules with their start dates, so the map switches itself at midnight? Or should the owner edit and republish?
   - Should the site wait for LTFRB's official 2026 fare guide? That would settle the ₱2.30/₱2.40 conflict and the non-aircon rate.
5. **Grace period:** for the weeks when some jeeps still charge the old fare (§1.6), show both, or only the new one with a note?
6. **Ground-truth fares:** is recording what drivers actually charge (Option E) worth fieldwork time? If so, should it sit beside the official estimate, or replace it where it exists?

## Sources

**LTFRB fare guides (primary).** I read them from Internet Archive copies captured 2 Oct 2025, because ltfrb.gov.ph returned HTTP 403 to every automated request.

- [fg-trad]: LTFRB, *PUJ General Fare Guide — Mega Manila*, effective 8 Oct 2023. https://ltfrb.gov.ph/wp-content/uploads/2024/11/Fare-Guide_Traditional-PUJ-Provisional-Fare-Increase_08Oct2023.pdf (archived: https://web.archive.org/web/20251002065448/https://ltfrb.gov.ph/wp-content/uploads/2024/11/Fare-Guide_Traditional-PUJ-Provisional-Fare-Increase_08Oct2023.pdf)
- [fg-mod-ac]: LTFRB, *Aircon Modern and Electric PUJ General Fare Guide*, effective 8 Oct 2023. https://ltfrb.gov.ph/wp-content/uploads/2024/11/Fare-Guide_Modernized-Aircon-Provisional-Fare-Increase_08Oct2023.pdf (archived 2 Oct 2025)
- [fg-mod-nac]: LTFRB, *Non-Aircon Modern and Electric PUJ General Fare Guide*, effective 8 Oct 2023. https://ltfrb.gov.ph/wp-content/uploads/2024/11/Fare-Guide_Modernized-Non-Aircon-Provisional-Fare-Increase_08Oct2023.pdf (archived 2 Oct 2025)
- [ltfrb-rates]: LTFRB, Fare rates page. https://ltfrb.gov.ph/fare-rates/ (not reachable in this research)

**Other LTFRB issuances (primary):**

- [jd-1996]: LTFRB, Joint Decision on applications for increase of fares for PUJs and air-con buses, 11 Nov 1996 (the rounding rule). https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/10/47229
- [mc94]: LTFRB Memorandum Circular 94-001, Consolidated guidelines on fare discounts, 13 Jan 1994. https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/11/38031

**Laws (primary):**

- [ra9994]: Republic Act 9994 (Expanded Senior Citizens Act of 2010). https://lawphil.net/statutes/repacts/ra2010/ra_9994_2010.html
- [ra10754]: Republic Act 10754 (2016, PWD benefits). https://lawphil.net/statutes/repacts/ra2016/ra_10754_2016.html
- [ra11314]: Republic Act 11314 (Student Fare Discount Act, 2019). https://lawphil.net/statutes/repacts/ra2019/ra_11314_2019.html

**Philippine News Agency (government):**

- [pna-2022]: 16 Sep 2022, "Fare increase for jeepneys, buses, taxis, TNVS effective Oct. 4". https://www.pna.gov.ph/articles/1183909
- [pna-2022b]: "PUV drivers reminded of Oct. 3 effectivity date of fare hikes". https://www.pna.gov.ph/articles/1184136
- [pna-2023]: 3 Oct 2023, "LTFRB: P1 provisional jeepney fare hike takes effect Oct. 8". https://www.pna.gov.ph/articles/1211067
- [pna-aug12]: 12 Aug 2025, "LTFRB reviews P15 minimum jeepney fare petition". https://www.pna.gov.ph/articles/1256378
- [pna-nov7]: 7 Nov 2025, "LTFRB consolidates PUV fare increase petitions". https://www.pna.gov.ph/articles/1262809
- [pna-dec5]: 5 Dec 2025, "No PUV fare hike after oil price rollback - LTFRB". https://www.pna.gov.ph/articles/1264715
- [pna-mar18a]: 18 Mar 2026, "PBBM orders suspension of public transport fare hikes". https://www.pna.gov.ph/articles/1271322
- [pna-mar18b]: 18 Mar 2026, "DOTr acts on PBBM's fare hike suspension order, relief programs". https://www.pna.gov.ph/articles/1271338
- [pna-jun3]: 3 Jun 2026, "Jeepney drivers' group mulls lifting of voluntary fare hike" (restates the March 2026 figures and the suspension). https://www.pna.gov.ph/articles/1276494
- [pna-jul22]: 22 Jul 2026, "Lopez orders LTFRB to begin PUV fare hike consultations". https://www.pna.gov.ph/articles/1280053

**Philippine Information Agency (government, unreachable):**

- [pia-sep]: "PUV fares adjusted to shield drivers, commuters". https://pia.gov.ph/news/puv-fares-adjusted-to-shield-drivers-commuters/ (HTTP 403; seen only in search results)

**Secondary (news; used only where no primary was reachable):**

- [mt-sep25]: Manila Times, 25 Sep 2026, "DOTr approves fare adjustment for PUVs". https://www.manilatimes.net/2026/09/25/news/dotr-approves-fare-adjustment-for-puvs/2433106
- [abante-sep25]: Abante TNT, 25 Sep 2026, "Pasahe sa jeepney tataas simula Setyembre 28". https://tnt.abante.com.ph/2026/09/25/pasahe-sa-jeepney-tataas-simula-setyembre-28/news/
- [abante-matrix]: Abante TNT, 26 Sep 2026, "LTFRB nagpaalala sa operators, drivers na ipaskil ang updated fare matrix". https://tnt.abante.com.ph/2026/09/26/ltfrb-nagpaalala-sa-operators-drivers-na-ipaskil-ang-updated-fare-matrix/news/
- [bm-sep23]: BusinessMirror, 23 Sep 2026, "Bus operators ask Palace to lift fare hike suspension". https://businessmirror.com.ph/2026/09/23/bus-operators-ask-palace-to-lift-fare-hike-suspension/
- [chron-sep22]: The Chronicle, 22 Sep 2026, "LTFRB to submit fare hike recommendation to DOTr by October". https://thechronicle.com.ph/ltfrb-to-submit-fare-hike-recommendation-to-dotr-by-october/
- [gma-mar17]: GMA News, 17 Mar 2026, "LTFRB OKs fare hikes across almost all public utility vehicles". https://www.gmanetwork.com/news/topstories/nation/980266/ltfrb-approves-fare-hike-in-almost-all-public-utility-vehicles/story/
- [topgear-mar17]: TopGear PH, 17 Mar 2026 (gives modern ₱2.30/km, and wrongly says "first 1km"). https://www.topgear.com.ph/news/motoring-news/ltfrb-approves-fare-adjustments-puvs-a2578-20260317
- [pp-2013]: Pleasant Programmer (By Implication / Sakay.ph), "Fare Data", 13 Jul 2013. https://pleasantprogrammer.com/posts/fare-data.html

[fg-trad]: https://web.archive.org/web/20251002065448/https://ltfrb.gov.ph/wp-content/uploads/2024/11/Fare-Guide_Traditional-PUJ-Provisional-Fare-Increase_08Oct2023.pdf
[fg-mod-ac]: https://web.archive.org/web/20251002063147/https://ltfrb.gov.ph/wp-content/uploads/2024/11/Fare-Guide_Modernized-Aircon-Provisional-Fare-Increase_08Oct2023.pdf
[fg-mod-nac]: https://web.archive.org/web/20251002073704/https://ltfrb.gov.ph/wp-content/uploads/2024/11/Fare-Guide_Modernized-Non-Aircon-Provisional-Fare-Increase_08Oct2023.pdf
[ltfrb-rates]: https://ltfrb.gov.ph/fare-rates/
[jd-1996]: https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/10/47229
[mc94]: https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/11/38031
[ra9994]: https://lawphil.net/statutes/repacts/ra2010/ra_9994_2010.html
[ra10754]: https://lawphil.net/statutes/repacts/ra2016/ra_10754_2016.html
[ra11314]: https://lawphil.net/statutes/repacts/ra2019/ra_11314_2019.html
[pna-2022]: https://www.pna.gov.ph/articles/1183909
[pna-2022b]: https://www.pna.gov.ph/articles/1184136
[pna-2023]: https://www.pna.gov.ph/articles/1211067
[pna-aug12]: https://www.pna.gov.ph/articles/1256378
[pna-nov7]: https://www.pna.gov.ph/articles/1262809
[pna-dec5]: https://www.pna.gov.ph/articles/1264715
[pna-mar18a]: https://www.pna.gov.ph/articles/1271322
[pna-mar18b]: https://www.pna.gov.ph/articles/1271338
[pna-jun3]: https://www.pna.gov.ph/articles/1276494
[pna-jul22]: https://www.pna.gov.ph/articles/1280053
[pia-sep]: https://pia.gov.ph/news/puv-fares-adjusted-to-shield-drivers-commuters/
[mt-sep25]: https://www.manilatimes.net/2026/09/25/news/dotr-approves-fare-adjustment-for-puvs/2433106
[abante-sep25]: https://tnt.abante.com.ph/2026/09/25/pasahe-sa-jeepney-tataas-simula-setyembre-28/news/
[abante-matrix]: https://tnt.abante.com.ph/2026/09/26/ltfrb-nagpaalala-sa-operators-drivers-na-ipaskil-ang-updated-fare-matrix/news/
[bm-sep23]: https://businessmirror.com.ph/2026/09/23/bus-operators-ask-palace-to-lift-fare-hike-suspension/
[chron-sep22]: https://thechronicle.com.ph/ltfrb-to-submit-fare-hike-recommendation-to-dotr-by-october/
[gma-mar17]: https://www.gmanetwork.com/news/topstories/nation/980266/ltfrb-approves-fare-hike-in-almost-all-public-utility-vehicles/story/
[topgear-mar17]: https://www.topgear.com.ph/news/motoring-news/ltfrb-approves-fare-adjustments-puvs-a2578-20260317
[pp-2013]: https://pleasantprogrammer.com/posts/fare-data.html
