# Database design: contributors and the studio's review step

**Status: proposed, for the owner's approval.** Nothing here is applied, and no migration is written until you approve it. After that, migrations are written by sessions and applied by you, one at a time.

Checked against the live project "ParaPo!" (Singapore, Postgres 17, free plan) on 2026-10-17, with read-only queries: `pg_policies`, `information_schema`, grants, default privileges, functions, indexes, the storage buckets, the Realtime publication and the migration ledger.

Contents:

1. [Today](#1-today)
2. [The policy audit](#2-the-policy-audit-goes-first)
3. [The contributor tables](#3-the-contributor-tables)
4. [Row security for contributors](#4-row-security-for-contributors)
5. [Caps](#5-caps-enforced-in-the-database)
6. [Retention](#6-retention)
7. [Backups](#7-backups-to-cloudflare-r2)
8. [The studio's review step: where drafts live](#8-the-studios-review-step)
9. [Prerequisites before the first migration](#9-prerequisites-before-the-first-migration)
10. [Migration order](#10-migration-order)
11. [Size](#11-size)
12. [Open decisions for the owner](#12-open-decisions-for-the-owner)
13. [The audit query, to re-run after every migration](#13-the-audit-query)

---

## 1. Today

| Table | In the glossary | Rows | On disk | Who writes |
| --- | --- | --- | --- | --- |
| `route` | route | 10 | 64 kB | Editors |
| `route_variant` | direction | 20 | 512 kB | Editors |
| `stop` | hotspot | 102 (2 terminals) | 224 kB | Editors |
| `route_stop` | a direction's hotspot links | 256 | 152 kB | Editors |
| `gps_session` | planned raw traces, never used | 0 | 64 kB | Editors, each their own |
| `private.editor` | the editor list | 3 | 24 kB | Nobody through the API |
| `storage.objects`, bucket `signboards` | signboard pictures | 24 | n/a | Editors |

- The database is 13 MB of the free plan's 500 MB.
- `auth.users`: 3 users, all 3 on the editor list, 0 anonymous.
- Extensions on: `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`, `plpgsql`. No PostGIS, no `pg_cron`, no `pg_partman`.
- The Realtime publication holds no tables, and `realtime.messages` has no policies, so no private channel opens for anyone.
- The security advisor: leaked-password protection is off (it needs the Pro plan); `private.editor` has row security and no policies, on purpose (0005).

## 2. The policy audit (goes first)

**Why:** an anonymous user in Supabase signs in as the `authenticated` role, the same role as an editor. Every rule that says only "signed in" lets every phone through. So every rule was read before anonymous sign-in is switched on.

**How each verdict was reached:** an anonymous signed-in user has `auth.uid()` set to its own id, the `authenticated` role, and is not on `private.editor`, so `private.is_editor()` answers false. A rule passes for it when its condition can be true for such a user.

### Every policy, today

| # | Table | Policy | Command | Roles | Condition | Passes for an anonymous signed-in user? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `route` | `route_read` | SELECT | public | `true` | **Yes**, as for anyone with the publishable key. Intended today: the map is public. The review step narrows it to approved rows (§8) |
| 2 | `route` | `route_insert` | INSERT | authenticated | owner is the caller, and is an editor | No |
| 3 | `route` | `route_update` | UPDATE | authenticated | is an editor | No |
| 4 | `route` | `route_delete` | DELETE | authenticated | is an editor | No |
| 5 | `route_variant` | `route_variant_read` | SELECT | public | `true` | **Yes**, as row 1 |
| 6 | `route_variant` | `route_variant_insert` | INSERT | authenticated | owner is the caller, and is an editor | No |
| 7 | `route_variant` | `route_variant_update` | UPDATE | authenticated | is an editor | No |
| 8 | `route_variant` | `route_variant_delete` | DELETE | authenticated | is an editor | No |
| 9 | `stop` | `stop_read` | SELECT | public | `true` | **Yes**, as row 1 |
| 10 | `stop` | `stop_insert` | INSERT | authenticated | owner is the caller, and is an editor | No |
| 11 | `stop` | `stop_update` | UPDATE | authenticated | is an editor | No |
| 12 | `stop` | `stop_delete` | DELETE | authenticated | is an editor | No |
| 13 | `route_stop` | `route_stop_read` | SELECT | public | `true` | **Yes**, as row 1 |
| 14 | `route_stop` | `route_stop_insert` | INSERT | authenticated | is an editor | No |
| 15 | `route_stop` | `route_stop_update` | UPDATE | authenticated | is an editor | No |
| 16 | `route_stop` | `route_stop_delete` | DELETE | authenticated | is an editor | No |
| 17 | `gps_session` | `gps_session_select` | SELECT | authenticated | owner is the caller (no editor check) | **Only for rows it owns, and none can exist:** making one needs the editor list (row 18). Effectively no. The table is dropped in the contributor migration anyway |
| 18 | `gps_session` | `gps_session_insert` | INSERT | authenticated | owner is the caller, and is an editor | No |
| 19 | `gps_session` | `gps_session_update` | UPDATE | authenticated | owner is the caller, and is an editor | No |
| 20 | `gps_session` | `gps_session_delete` | DELETE | authenticated | owner is the caller, and is an editor | No |
| 21 | `storage.objects` | `signboards_select` | SELECT | authenticated | bucket `signboards`, and is an editor | No. (The bucket is public, so anyone reads a board by its public address, by design, as the publish does) |
| 22 | `storage.objects` | `signboards_insert` | INSERT | authenticated | bucket `signboards`, and is an editor | No |
| 23 | `storage.objects` | `signboards_update` | UPDATE | authenticated | bucket `signboards`, and is an editor | No |
| 24 | `storage.objects` | `signboards_delete` | DELETE | authenticated | bucket `signboards`, and is an editor | No |

**Result: no write rule passes.** An anonymous phone can change nothing on the map, the signboards or the editor list today. The four read rules pass, exactly as they do for anyone with the publishable key; nothing more.

### Beyond the policies

| What | Found | For an anonymous signed-in user |
| --- | --- | --- |
| `private.is_editor()` | Security definer, search path pinned, executable by `authenticated` only | It answers false, about the caller alone. The `private` schema is not exposed through the API. Safe |
| `public.touch_updated_at()` | A trigger function, executable by everyone | Can't be called directly; a trigger function only runs as a trigger. Safe |
| `private.editor` | Row security on, no policies, no grants to `anon` or `authenticated` | Unreachable. Safe |
| Table grants | `anon` and `authenticated` hold SELECT, INSERT, UPDATE and DELETE on every public table; TRUNCATE is revoked (0005) | Row security holds them back, and the audit above shows it does. But see fix 1 |
| **Default privileges** | A new table made by `postgres` in `public` grants `anon` and `authenticated` SELECT, INSERT, UPDATE, DELETE and MAINTAIN | **The gap.** A new table whose migration forgets `enable row level security` is open to every phone, and to anyone with the publishable key. See fix 1 |
| Storage buckets | One, `signboards`: public, SVG only, 100 kB | As above |
| Realtime | No tables published; `realtime.messages` has no policies | Nothing to receive. Broadcast on public channels is open to anyone with the key, as it already is; nothing here uses it |
| GraphQL | `pg_graphql` is not installed | Nothing exposed |

### The fixes, before anonymous sign-in is switched on

1. **Close the default grants** (migration 0017, ticket contribute/06). Revoke INSERT, UPDATE, DELETE and MAINTAIN on every public table from `anon`, which never writes. Change the default privileges in `public` so a new table grants nothing to `anon` or `authenticated`. Each new table's migration then grants exactly what its policies need. A forgotten grant fails closed ("permission denied"), never open. Row security stays on as well.
2. **Turnstile on the studio's sign-in first** (ticket contribute/07). Supabase's CAPTCHA setting is project-wide: it guards sign-up, sign-in and password reset, not only anonymous sign-in. The day it is switched on, the studio's email sign-in and "Forgot password?" need a Turnstile token, or editors are locked out.
3. **The sign-up switch.** You turned sign-ups off on 2026-09-14. Check in the dashboard whether anonymous sign-ins need "Allow new users to sign up" on. If they do, email sign-up reopens with it. Such an account is as powerless as an anonymous one (the audit above), but it fills `auth.users`. The fix is a "Before User Created" auth hook that refuses every sign-up that isn't anonymous: a small function in `private`, and one dashboard setting (ticket contribute/09).
4. **A rule for every future policy.** An editor's rule calls `private.is_editor()`. A phone's rule checks that the row is the caller's. Never `to authenticated using (true)`, and never "signed in" alone, since every phone is signed in. The audit query in §13 is re-run after every migration (the Haiku session's job).
5. **The anonymous sign-in rate limit** is 30 an hour per IP address by default. Mobile networks put many phones behind one address. Watch it once the button is public, and raise it under Authentication, Rate Limits, if first saves fail.

## 3. The contributor tables

They point at nothing in the route tables except through `contribution_use`. Lines stay GeoJSON (no PostGIS), as everywhere else since 0001. They replace the unused `gps_session`, which is dropped in the same migration.

```
auth.users ──1:1── contributor ──1:n── contribution ──1:n── point_batch (monthly pieces)
                                            │
                                            ├──1:n── hinto
                                            └──1:n── contribution_use ──▶ a direction or a hotspot (by id)
```

### `contributor`: one row per account (a phone's first anonymous identity, upgraded)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid, primary key, references `auth.users (id)` on delete cascade | The phone's anonymous identity, `auth.uid()`. Deleting the auth user deletes everything of that phone's |
| `first_seen_at` | timestamptz, not null, default `now()` | |
| `blocked_at` | timestamptz | Set by an editor. A blocked phone can add nothing |
| `blocked_by` | uuid, references `auth.users (id)` on delete set null | The editor |
| `block_note` | text, at most 500 characters | Why |
| `name` | text, 1 to 80 characters | Set with the account (`set_profile`). Editors read it; the studio shows it |
| `phone` | text, `+639XXXXXXXXX` | The tester's number, set with the account. Only the owner reads it: no column grant for editors or the contributor's own client reads |
| `profile_updated_at` | timestamptz | |

Indexes: the primary key; `blocked_by` (partial, where not null). The studio shows a phone as the first six characters of its id, and the account's name beside it; never the number.

### `contribution`: one row per saved recording

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid, primary key | Made on the phone at Start, so a resent recording is never stored twice |
| `contributor_id` | uuid, references `contributor (id)` on delete cascade | Stamped with `auth.uid()` on insert, whatever the phone sends. Set to null after 24 months (§6) |
| `format_version` | smallint, not null | The phone's saved format |
| `rules_version` | smallint, not null | The rules that made the totals, the hintos and the line |
| `consent_version` | smallint, not null | The consent text agreed to |
| `started_at`, `ended_at` | timestamptz, not null | The phone's clock. `ended_at` after `started_at`, at most 6 hours later |
| `sent_at` | timestamptz, not null | The phone's clock when it sent. With `received_at` it gives the clock's error |
| `received_at` | timestamptz, not null | The server's clock, stamped on insert |
| `vehicle` | text | `jeep`, `bus`, `train`, `ferry`, `tricycle`, `other`, or null |
| `start_name`, `end_name` | text | At most 80 characters each. Optional |
| `description` | text | At most 1,000 characters. Optional |
| `distance_m`, `moving_s`, `standing_s`, `lost_s`, `point_count` | integer, not null, at least 0 | The totals the phone showed |
| `events` | jsonb, not null | Start, Stop, Resume and Save with their times. An array, at most 500 entries |
| `gaps` | jsonb, not null | Each gap: from, to, cause (hidden, no fix, reload). An array, at most 500 entries |
| `line` | jsonb | The kept points as a GeoJSON LineString, thinned within 5 m (`overviewOf`, as a direction's overview is). At most 200 kB |
| `west`, `south`, `east`, `north` | double precision | The line's box, for the area filter |
| `hidden_at`, `hidden_by`, `hidden_note` | timestamptz; uuid references `auth.users` on delete set null; text | Set by an editor. Hidden is not deleted |

Indexes: the primary key; `(contributor_id, received_at)` (the phone's foreign key, the day cap, "this phone's recordings"); `(received_at)` (the Contributors map's date filter); `hidden_by` (partial, where not null).

The area filter is the box overlap (`east >= west of view` and so on) inside a date range. The date index keeps the slice small; at tens of thousands of rows a grid-cell index can be added.

### `point_batch`: the raw points, one row per few minutes

**Partitioned by month**, plain Postgres (`partition by range (month)`), no extension.

| Column | Type | Notes |
| --- | --- | --- |
| `contribution_id` | uuid, not null, references `contribution (id)` on delete cascade | |
| `seq` | smallint, not null | 0, 1, 2… in order |
| `month` | date, not null | The month the contribution arrived (server clock), stamped on insert. The partition key |
| `first_at` | timestamptz, not null | The first point's time (phone clock) |
| `first_lat`, `first_lng` | integer, not null | The first point, in millionths of a degree (about 0.1 m) |
| `point_count` | smallint, not null | 1 to 600 (10 minutes at one a second) |
| `dt_ms` | integer[] | Milliseconds since the point before; the first is 0 |
| `dlat`, `dlng` | integer[] | The change from the point before, in millionths of a degree |
| `accuracy_m` | smallint[] | The phone's accuracy |
| `speed_cms` | smallint[] | The phone's own speed in cm/s, null where it gave none |

- **Primary key** `(contribution_id, seq, month)`. Its first column covers the foreign key.
- **Why whole-number arrays, not a packed binary:** the database can read them, so it checks the speed itself (§5). Postgres compresses them, and at one point a second the changes are small numbers. Expect about 30 kB per hour of riding; the field test measures it.
- **Each row decodes on its own:** its first point is absolute.
- **The monthly pieces** are made ahead: every month from the first migration to December 2028, plus a default piece that should stay empty. A yearly step adds the next year (§6). Dropping a month is `drop table`, instant, with no slow delete and no bloat.

### `hinto`: one row per time standing still

| Column | Type | Notes |
| --- | --- | --- |
| `contribution_id` | uuid, not null, references `contribution (id)` on delete cascade | |
| `seq` | smallint, not null | In order |
| `started_at` | timestamptz, not null | Phone clock |
| `seconds` | integer, not null | 1 to 21,600 |
| `lat`, `lng` | double precision, not null | Where. Plain numbers rather than GeoJSON, so the database can check and group them |
| `cell` | bigint, generated, stored | A grid cell about 22 m across, from `lat` and `lng`. "Many hintos at one spot" without PostGIS: group by cell, look at the cell and its eight neighbours |
| `rules_version` | smallint, not null | |

Primary key `(contribution_id, seq)`, which covers the foreign key. Index on `cell`.

Which hotspot a hinto falls in is **not stored**: hotspots move and new ones are drawn, so the studio works it out from the boxes when it draws the map.

### `contribution_use`: the machine-learning labels

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid, primary key, default `gen_random_uuid()` | |
| `contribution_id` | uuid, not null, references `contribution (id)` on delete cascade | |
| `kind` | text, not null | `direction` (Use this line) or `hintuan` (Draw a hintuan here) |
| `subject_id` | uuid, not null | The direction's or hotspot's id |
| `editor_id` | uuid, references `auth.users (id)` on delete set null, default `auth.uid()` | |
| `created_at` | timestamptz, not null, default `now()` | |

- Unique `(contribution_id, kind, subject_id)`, which covers the foreign key. Indexes on `subject_id` and `editor_id`.
- **No foreign key on `subject_id`, on purpose:** when an editor uses a line, the direction exists only as a draft (§8). Its id is made in the studio and kept when the draft is approved, so the link resolves then. A discarded draft leaves a link to nothing; the export for machine learning skips those.
- A contributor's "Delete my recordings" removes these links with the contribution. The direction an editor drew stays: it is the editor's work.

### Helpers in `private` (not reachable through the API)

As `private.is_editor()` (0005): security definer, search path pinned, every name qualified, execute revoked from `public` and `anon`.

- **`private.can_contribute()`:** true unless the caller's `contributor` row is blocked. A policy can't read `contributor` itself, because a phone has no read rule there; without this helper a block check would see nothing and fail open.
- **The insert triggers** (§5): they stamp the server-owned columns and enforce the caps. They count rows a phone can't read (its other batches), so they run as definer.

### The save: one function, one transaction

`public.save_contribution(recording jsonb)` returns `saved` or `already saved`.

- **Security invoker:** it runs as the phone, so row security and the triggers apply exactly as they would to a direct insert. No security definer function sits in `public` for the advisor to flag (its lints 0028 and 0029).
- In one transaction: the `contributor` row (if new), the `contribution` (`on conflict (id) do nothing`: a resend after a lost answer is "already saved"), its batches, its hintos. All or nothing, so no half-saved recording.
- Executable by `authenticated` only. Search path pinned.
- A 4-hour recording is about 400 kB of JSON, well inside the API's limits.

## 4. Row security for contributors

Row security on for every table, and the grants (fix 1) match the rules.

| Table | The phone (anonymous, signed in) | Editors | Commuters and the nightly publish (`anon`) |
| --- | --- | --- | --- |
| `contributor` | Insert its own row only (`id = auth.uid()`; the trigger clears the block columns). No read, no update, no delete: a blocked phone can't unblock itself by deleting and re-adding its row | Read; update the block columns | Nothing |
| `contribution` | Insert its own, when `private.can_contribute()`; read its own; delete its own ("Delete my recordings") | Read; update `hidden_*`, and `line`, `rules_version` and the box when recounting with better rules. No insert, no delete | Nothing |
| `point_batch` | Insert into its own contributions only | Read | Nothing |
| `hinto` | Insert into its own contributions only | Read; insert and delete when recounting with better rules | Nothing |
| `contribution_use` | Nothing | Read, insert, delete | Nothing |

- **Why a phone may read its own contributions:** Postgres applies the read rules to a delete that names rows, so "Delete my recordings" needs them. It also lets the page say what reached the studio. A phone reads nothing else, not even its own points back.
- **Deleting on request** (a phone that lost its identity): you delete that anonymous user in the dashboard, and everything cascades.
- **Built-in guarantee:** the nightly publish reads as `anon`, and `anon` can read none of these tables. The publish also probes them on every run and fails if any row comes back (ticket studio-maps/02).
- **The contributor page's session** is kept under its own storage key (`parapo.contributor-auth`), apart from the studio's. Both pages share the site's origin, and with the default key an anonymous sign-in on `/contribute/` would replace an editor's studio session.

## 5. Caps, enforced in the database

Starting numbers, for you to approve (§12). Each holds whichever way a row arrives, through the save function or a direct insert.

| Cap | Starting number | Where |
| --- | --- | --- |
| Points per contribution | 14,400 (4 hours at one a second) | `point_batch` insert trigger |
| Points per row | 600 | `point_batch` check |
| Contributions per phone | 20 in any 24 hours | `contribution` insert trigger |
| A recording's length | 6 hours from Start to Save | `contribution` check |
| Speed between two points | 150 km/h. The phone already drops points above 120 km/h, so a real ride never comes near it | `point_batch` insert trigger, reading the arrays |
| Time | Each point after the one before | `point_batch` insert trigger |
| Where | Every point and hinto inside the Philippines (4° to 22° N, 116° to 127° E) | Checks and the trigger |
| Text | Names 80 characters, description 1,000, block and hide notes 500 | Checks |
| Size | The line 200 kB; events and gaps 500 entries each; hintos 2,000 per contribution | Checks |
| Who | A blocked phone adds nothing | `private.can_contribute()` in the insert rule |
| Sign-in | Turnstile on the first save; 30 sign-ins an hour per IP address | Supabase Auth |

The triggers also stamp `received_at = now()`, `contributor_id = auth.uid()`, the batch's `month`, and clear `hidden_*` and the block columns on insert, whatever the phone sent.

**Blocking is a speed bump, not a wall.** A blocked phone can clear its data and come back as a new identity. Turnstile and the IP rate limit are what slow that down; Hide cleans up what gets through.

## 6. Retention

**Raw points: 24 months** (your 4b). Then only the cleaned line, the times and the hintos.

Once a month, from November 2028 (24 months after the first contributions), one call run by you in the SQL editor, `private.retire_month(month)`:

1. **Drops the month's piece** of `point_batch`. Instant.
2. For the contributions that arrived that month:
   - **cuts 200 m off each end of the line** (a plpgsql walk along the coordinates, as 0013 computed centroids), and drops the hintos within 200 m of the old ends, since a ride's ends can point to a home;
   - **clears** `start_name`, `end_name` and `description`, the free text most likely to hold personal details;
   - **unlinks** the contribution from its phone (`contributor_id` set to null).
3. **Keeps** the line, the times and totals, the hintos, `vehicle`, and `contribution_use`.

Also in the monthly step:

- `private.add_months(12)` once a year, so there are always months made ahead. The monthly call warns when fewer than six remain.
- Delete anonymous users older than 30 days who never saved a contribution (Supabase's own recommendation; nothing cleans them up automatically).

**Who runs it:** you, by hand, with a reminder. `pg_cron` could run it, but it is a new extension; the first run is two years away, so the choice can wait (§12).

## 7. Backups to Cloudflare R2

Your 7b. The free plan has no downloadable backups, and a ride can't be recorded again.

- **A weekly GitHub workflow** (Sundays, early morning Manila time) runs `pg_dump` of the contributor tables. Recommended: the route tables, `private.editor` excepted, too, since drafts and drawings are not in the published map.
- **It connects as a read-only role** made for it, `backup_reader`: a login role with SELECT on those tables and a read rule `to backup_reader` on each, nothing else. Its connection string is a GitHub secret, the project's first database secret, so it holds as little as possible. Check on setup that Supabase's connection pooler accepts the role.
- **Encrypted before it leaves the runner,** with `gpg` (already on GitHub's runners) to your public key. The private key never touches GitHub.
- **Uploaded to a private R2 bucket** with an API token scoped to that bucket alone (two more GitHub secrets).
- **Kept 60 days:** an R2 lifecycle rule deletes older copies, so a deletion or a retired month leaves the backups within 60 days. The consent screen says so.
- **Nothing in the logs:** the repo is public, so its workflow logs are too. The workflow prints sizes and counts only, uploads no GitHub artifact, and opens no issue with data in it.
- **A restore is tried once** on setup, into a local Postgres, and the steps are written down.

## 8. The studio's review step

Draft, Pending, Approved, for routes and hotspots (`../studio-maps/spec.md`). The hard part, in the spec's words: keeping an approved version apart from a draft of the same route or hintuan.

### Where drafts live: one `draft` table (recommended)

The live tables keep holding only what commuters may see: approved rows, and taken-down ones. A draft lives in one table of its own, as the edited thing in one JSON value.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid, primary key | |
| `kind` | text, not null | `route` or `hotspot` (a terminal or a hintuan) |
| `subject_id` | uuid, not null | The route's or hotspot's id. For an edit, the approved row's id; for something new, an id made in the studio and kept when approved |
| `is_new` | boolean, not null | Nothing approved has this id yet |
| `status` | text, not null, default `draft` | `draft` or `pending` |
| `payload` | jsonb, not null | A route: its facts and both directions with their drawings. A hotspot: its box, names and kind. Shaped by the routes model's Zod schemas, with a version number |
| `base_updated_at` | timestamptz | The approved row's `updated_at` when the draft began. Approve refuses if the approved row changed since |
| `editor_id` | uuid, not null, references `auth.users (id)`, default `auth.uid()` | Who is changing it: "being changed by X" |
| `note` | text | Send back's note |
| `created_at`, `updated_at`, `submitted_at` | timestamptz | |

- **Your 8a is one unique index:** `(kind, subject_id)`. A second editor can't start a draft of the same route or hotspot; the studio shows them "being changed by X" instead. Optionally a second unique index on a route draft's ends, so two new drafts can't claim the same pair of ends.
- **The uniqueness rules stay on the live tables, untouched in spirit:** one route per pair of ends and via, two directions per route, one terminal per place. A draft can't break them, because a draft isn't in those tables. They are checked when the draft is submitted (the studio's save checks) and enforced when it is approved (the live indexes refuse, with the studio's existing messages). The ends and terminal indexes become partial, `where status = 'approved'`, so a taken-down route doesn't block a new one with the same ends.
- **Why not mirror tables** (`route_draft`, `route_variant_draft`, `stop_draft`): every column added later would have to be added twice and kept in step, and the uniqueness rules would need a second copy. A drawing is already JSON (`control_points`, `segments`, `shape`), so the payload holds what the tables hold today.
- **The cost:** the database can't check a draft's columns the way it checks a live row's. The studio checks the payload with Zod, and the live tables check everything again on approve.

### Status on the live rows

- `route` and `stop` gain `status` (`approved` or `taken_down`, default `approved`) and `status_at`. `stop` also gains `updated_at` with the touch trigger, which it lacks today (the waiting list and `base_updated_at` need it).
- **A direction follows its route** and has no status of its own: a route is reviewed with both its directions. A link (`route_stop`) shows when both its direction's route and its hotspot are approved.
- **On the day it ships, every row is approved** (the column's default), so commuters see no change.
- **Two guards, as triggers:** a route can't be approved unless both its end hotspots are approved; a hotspot can't be taken down while an approved route ends at it. Without the second, the published map would hold a route whose end is missing, which `check-map-data.mjs` fails.

### Anonymous readers see approved rows only

The four read rules (audit rows 1, 5, 9, 13) become two each:

- `to anon, authenticated using (status = 'approved')`; for a direction, its route is approved; for a link, both ends are;
- `to authenticated using ((select private.is_editor()))`: editors also see taken-down rows.

`draft` and `editor_name` are editors-only. `takedown` is readable by `anon` for three columns only, its kind, id and time (below).

**What that gives for nothing:** the nightly publish reads as `anon`, so it reads approved work only, with no change to its queries. A phone, which is `authenticated` but no editor, also sees approved rows only, never a draft.

### Hintuan links come from approved geometry only

Links are worked out where they are today: the studio's save code (`routes-write.ts`, `hotspots-write.ts`), against the live lines and boxes. With drafts kept out of the live tables:

- **Approve** writes the draft into the live tables through that same code, re-links, then deletes the draft. The draft is deleted last, so an approve that fails halfway leaves the draft to try again.
- A draft line never gets a link, so **a draft hintuan can't leak onto a public timeline.** In the Playground, a draft's passes are worked out in the browser for display only.
- Taken-down hotspots keep their links, hidden by the read rule, so putting one back shows it on the right timelines at once.

### Take down and the publish's 30% guard

The publish refuses a map that lost more than 30% of a table's rows since the last file (ADR 0001). Taking down four of ten routes on purpose would trip it.

- **Recommended:** a small `takedown` table: `kind`, `subject_id`, `taken_down_at`, `editor_id`. Written in the same step as the take-down. `anon` is granted SELECT on `kind`, `subject_id` and `taken_down_at` only (a column grant, since a read rule can't hide a column): they name things that were public. Who took it down stays private. The publish reads the takedowns since its last file's `published_at` and counts those rows as deliberate, so the guard judges only the rest. A policy slip that hides everything still trips it.
- **The fallback** already exists: "Run workflow" with Force ticked.
- **Put back:** an editor can set a taken-down row back to approved. It reaches commuters at the next publish.

### One draft at a time (your 8a)

- The unique index above.
- **"Being changed by X":** X is the editor's name from a small `editor_name` table (`user_id` references `private.editor`, `name`), readable by editors only, filled by you by hand, as the editor list is.
- **A stale draft:** someone must be able to free a route whose draft is abandoned. Recommended: any editor may discard another's draft after 7 days without a change, after a confirm (§12).
- In the database any editor may update or delete any draft: Send back is done by another editor, and Approve deletes the draft. Whose draft may be edited is the studio's rule. Editors are trusted, and any editor can approve their own work anyway (the owner's call, 2026-10-15).

### Editing an approved route

The studio starts a draft with `subject_id` set to the route's id and `base_updated_at` set to its `updated_at`. Commuters keep the approved version until the draft is approved.

## 9. Prerequisites before the first migration

Ticket contribute/05.

1. **Generated Supabase types.** `database.types.ts` doesn't exist, and the studio's rows are typed `any` (the blind-spot audit of 2026-10-17, finding 7). Generate it (read-only) and type the client `SupabaseClient<Database>`. Regenerated after every migration. The contributor page needs the same file, so `rule-changes.md` proposes `src/shared/types/database.types.ts` instead of `src/features/studio/data/`; it holds types only, so no code reaches any page.
2. **The migration ledger.** `supabase_migrations.schema_migrations` lacks 0001 to 0003, which were applied by hand in September (their effects are live: the pinned search path, the split policies). 0004 and 0005 are recorded as `stop_hotspot` and `editor_role`. 0015 was recorded before 0013 and 0014, which is only the order they were applied. For you to run, as `postgres` (safe to run twice):

   ```sql
   -- 0001 to 0003: applied by hand before the ledger was used. The versions sort before 0004's.
   insert into supabase_migrations.schema_migrations (version, name, statements) values
     ('20260907000001', '0001_init', '{}'),
     ('20260907000002', '0002_pin_function_search_path', '{}'),
     ('20260908000003', '0003_rls_performance', '{}')
   on conflict (version) do nothing;
   -- 0004 and 0005 under their files' names.
   update supabase_migrations.schema_migrations set name = '0004_stop_hotspot' where version = '20260912135400' and name = 'stop_hotspot';
   update supabase_migrations.schema_migrations set name = '0005_editor_role' where version = '20260914172324' and name = 'editor_role';
   ```

   And a short `supabase/migrations/README.md` mapping each file to its ledger version, since the files are numbered and the ledger is timestamped.
3. **0014's old index was never dropped.** `stop_terminal_informal_unique` still sits beside `stop_terminal_place_unique`. They agree, so it is harmless, but the review step replaces the terminal index, and two would confuse it. Migration 0016 drops it, finishing 0014.

## 10. Migration order

Written by sessions, applied by you, one at a time. Two sessions never write migrations at once. Numbers are the expected ones; each takes the next free number when written.

| # | Migration | Ticket | What it does |
| --- | --- | --- | --- |
| 0016 | `finish_terminal_index` | contribute/05 | Drops 0014's old index |
| 0017 | `anon_writes_revoked` | contribute/06 | The audit's fix 1: `anon` loses INSERT, UPDATE, DELETE and MAINTAIN; new tables grant nothing by default |
| 0018 | `review` | studio-maps/01 | `status` and `status_at` on `route` and `stop`, `stop.updated_at`, the partial unique indexes, `draft`, `takedown`, `editor_name`, the two guards, the new read rules |
| 0019 | `contributions` | contribute/08 | The five tables, the monthly pieces, the helpers, the triggers, `save_contribution`, `retire_month`, `add_months`; drops `gps_session` |
| 0020 | `backup_reader` | contribute/15 | The backup's read-only role and its read rules |
| 0021 | `loops` | loops (slice A) | `route.is_loop`; a loop's ends null; the signboard required and unique among loops; one direction; made a loop or not and stays so. Written; the owner applies it. Takes 0021, so 0018 to 0020 keep their numbers |
| (0022) | `signup_hook` | contribute/09 | Only if the sign-up switch needs it (fix 3); was 0021 |

After each: regenerate the types, re-run the advisors and §13's query.

## 11. Size

- About **45 kB per hour of riding** in all: 30 kB of raw points, the line, the hintos and the row. The field test measures the real figure.
- **The free plan** (500 MB, 13 MB used) holds about 10,000 hours of riding. At 100 contributors riding an hour a day, that is about 3 months.
- **The Pro plan** (8 GB, about US$25 a month; check the price before buying) holds the 24 months of raw points at that rate with room to spare.
- **Upgrade when the database passes 70% of the plan.** The Haiku session reports the size weekly.
- **The Contributors map reads in slices** (a date range, an area, the thinned line), never a whole table.

## 12. Open decisions for the owner

Each has a recommendation; approving this file approves the recommendations unless you say otherwise.

1. **Drafts in one `draft` table, as JSON** (recommended), or mirror tables (§8).
2. **Take down vs the 30% guard:** a public list of takedowns the guard subtracts (recommended), or Force by hand each time (§8).
3. **A stale draft:** any editor may discard another's draft after 7 days without a change, after a confirm (recommended) (§8).
4. **Editor names** for "being changed by X": a small table you fill by hand (recommended) (§8).
5. **The caps' starting numbers** (§5): 4 hours of points, 20 contributions a phone a day, 6-hour recordings, 150 km/h, the Philippines' box, 80 and 1,000 characters.
6. **The sign-up switch** (§2, fix 3): check it; if anonymous sign-in needs sign-ups on, add the hook that refuses other sign-ups (recommended).
7. **CAPTCHA reaches the studio's sign-in** (§2, fix 2): the studio gains the Turnstile widget the same day. There is no way to protect anonymous sign-in alone.
8. **After 24 months** (§6): cut 200 m off each end of the line, clear the names and the description, unlink from the phone, keep `vehicle` (recommended). Your 4b, read strictly, would also clear `vehicle`; it is one word and a useful label.
9. **Who runs the monthly retirement:** you, by hand, from November 2028 (recommended for now), or `pg_cron` later (§6).
10. **Backups** (§7): the contributor tables and the route tables (recommended), 8 weekly copies (60 days), encrypted to your key, through a read-only role.
11. **The free plan:** stay on it through the test period; move to Pro at 70% full (recommended).

## 13. The audit query

Re-run after every migration. Every row it returns must be explained: a rule that lets `authenticated` through without asking about the editor list or the row's owner, or a table in `public` without row security.

```sql
-- Rules that let any signed-in user (every phone) through.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
  and (roles @> '{authenticated}' or roles @> '{public}')
  and coalesce(qual, '') || coalesce(with_check, '') !~ '(is_editor|auth\.uid|can_contribute)'
order by 1, 2, 3;

-- Tables in public without row security.
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

-- What anon may write anywhere in public (should be nothing after 0017).
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
```

Today the first query returns the four public read rules (`using (true)`), which are intended until 0018 narrows them to approved rows. The second returns nothing. The third returns every public table, which 0017 fixes.
