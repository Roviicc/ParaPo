# Contributor accounts

Planned with the owner on 2026-10-24. Status: tickets written; 01 and 05 can start.

## What the owner asked

> For contributor we want them to create an account, sign in, profile, history upload, account; they insert name, email, number, password; no verification for now because it's a closed testing. The current contribute on the route card list will be removed — it will be blank for now, but the card remains.

The owner's answers (2026-10-24):

1. **Who can sign up:** anyone can, technically. The testing is closed because nothing public leads to it: the owner picks people and sends them the link.
2. **The map's "+ Contribute" button:** hidden for now.
3. **Design:** today's style, inputs and buttons. No unnecessary labels: the layout explains itself.
4. **Recordings made before accounts:** linked to the account on its first sign-in, on that phone.

## How it works

### One identity, upgraded

Every phone already has an anonymous Supabase user, made on its first upload behind Turnstile (`features/contribute/api/upload-contribution.ts` `ensureSignedIn`). Its id is the `contributor` row's id and every `contribution.contributor_id`.

- **Sign up** = make sure the phone has its anonymous user (Turnstile), then `auth.updateUser({ email, password })` turns it into a permanent user **with the same id**. Every upload this phone already made is the account's at once; no row moves. Name and number go to the `contributor` row through `set_profile` (01).
- **Sign in** on a phone that has no anonymous user yet: `signInWithPassword` (with Turnstile's token: CAPTCHA is on for the whole project).
- **Sign in** on a phone that already has its own anonymous user (it uploaded before, then the person signs in to an account made elsewhere): the anonymous identity's uploads are claimed by the account. While still anonymous the phone asks `begin_claim()` for a one-time token, signs in, then calls `finish_claim(token)`, which moves that anonymous contributor's contributions to the account and removes the empty anonymous contributor (01).
- The Before User Created hook (`20261023090000_signup_hook.sql`) stays as it is: an upgrade and a password sign-in create no new user, so it never runs for them, and it still refuses an email sign-up made any other way.

### The contributor page

- Not signed in to an account → the page shows **Sign in** (email, password) with a way to **Create account** (name, email, number, password). Nothing else of the page shows, but a recording already on the phone is never lost: it waits, and is listed after sign-in (04).
- Signed in → Ready, as today, with a **Profile** entry (top left, beside History, 48×48, as History is).
- **Profile:** name and number (editable), email (shown), Sign out. Sign out keeps the phone's unsent recordings; they wait for the next sign-in.
- **History:** the account's uploads from the database, whichever phone sent them, plus what is only on this phone. Remove works on any upload the account owns (RLS already lets a contributor delete its own).
- The session is kept by Supabase in this page's own storage key, so a signed-in contributor can record offline; only signing in needs the network.

### Fields, with no extra labels

The layout explains itself (the owner): no helper text, no descriptions under fields, no "Required". Each input still has an accessible name (CLAUDE.md, Accessibility): the existing `InputField`'s label is its name and stays short (Name, Email, Number, Password). Errors say what to do in one line ("Wrong email or password").

- **Name:** 1–80 characters.
- **Email:** an email.
- **Number:** a Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX), stored as +639XXXXXXXXX. Not verified; it's for the owner to reach the tester.
- **Password:** at least 8 characters (Supabase's minimum is set to match, see the owner's steps).

### Who sees what

Approved by the owner with the consent text, 2026-10-24:

- **Editors** in the studio see a ride's contributor **name**.
- **Email and number** are seen only by the owner (in Supabase), to contact testers. They never reach the studio's screens.
- **The public** sees nothing of it.

### The public map

- The route list's end card (`app/public-map/contribution-card.tsx`) keeps its surface and size but shows nothing: no text, no link.
- The map's "+ Contribute" button (`contributor-button.tsx`) is not shown.
- The public page still never loads contribute code (`check-build.mjs`).

## Consent version 3 (approved by the owner, 2026-10-24)

Uploads now carry who the person is, so the consent changes and `CONSENT_VERSION` becomes 3. A recording agreed under 2 is still sent. One agreed under 1 never sends on its own, only after the earlier-recordings question's Send, as before. The changed lines (the others stay):

- **What is recorded:** "Your name, email and number when you sign up. While you record: your phone's location about once a second, the times, the gaps, and what you type."
- **Who sees it:** "ParaPo's editors see your rides and your name, in the studio. Only the owner sees your email and number, to contact you. Never the public."
- **How long:** "The exact points for 24 months. After that, only the cleaned line, the times and the hintos, cut short at each end and no longer tied to you. Your account stays until you ask the owner to delete it. Backups are kept 60 days."
- **Deleting:** "Remove an upload in History on any phone you're signed in on, or ask the owner to delete your account."

The consent, and the earlier-recordings answer, are kept per account on the phone (`parapo.contribute.consent.<userId>`); what an earlier build stored phone-wide goes to the first account that signs in. Asked once per account, after Create account and before the first recording.

## Tickets

| # | Ticket | Who | Blocked by |
| --- | --- | --- | --- |
| 01 | [The database: profile, claim](issues/01-database-profile-and-claim.md) | a session writes it; the owner applies it | — |
| 02 | [Sign up and sign in](issues/02-sign-up-and-sign-in.md) | a session | 01's contract (not its apply) |
| 03 | [Profile and the account's History](issues/03-profile-and-history.md) | a session | 02 |
| 04 | [Linking earlier recordings](issues/04-link-earlier-recordings.md) | a session | 02 |
| 05 | [Public map: empty card, no button](issues/05-public-map-entry-hidden.md) | a session | — |
| 06 | [Consent v3 and the studio's name](issues/06-consent-v3-and-studio-name.md) | a session, after the owner approves the text | 01 |

**Release order:** 05 can ship on its own. 02–04 and 06 reach `main` together, and only after the owner has applied 01 and switched email confirmation off: code that signs up against a database without 01 would fail.

## Decisions so far

- 05 resolved (#382): the public map's end card is empty and `aria-hidden`, the "+ Contribute" button is gone. See [05](issues/05-public-map-entry-hidden.md).

## The owner's steps (Supabase dashboard, when 01 is ready)

1. Apply 01 (`supabase/apply/README.md` gets its section), run its check file.
2. Authentication → Sign In / Providers → Email: on; **Confirm email: off** (closed testing, no verification).
3. Authentication → Policies (password): minimum length 8.
4. Keep anonymous sign-ins on and CAPTCHA on: the upgrade path needs both.

## Not now

- Email verification, password reset by email (the owner resets a tester by hand in Supabase), phone verification.
- Showing the card's content again, and the map button: a later decision.
- Snapping (a separate plan); the cleaner drawn line is its own PR.

## Docs this changes

`CONTEXT.md` (a contributor is a person with an account, not a phone), ADR 0004's note on who a contribution belongs to, and `.scratch/contribute/database.md` §3 (the contributor row has a name and number). 06 carries the doc edits; the owner approves them with the consent text.
