---
status: accepted
date: 2026-10-17
---

# A commuter's location leaves the phone only on the contributor page, after consent

[ADR 0001](0001-visitors-read-a-published-file.md) kept the public map from
ever sending a coordinate or an identity. On 2026-10-17 the owner opened ParaPo
to contributors: anyone may make a contribution and send it, so the studio
learns where jeeps really go and stand.

The public map still sends nothing. A person's location leaves the phone only
on the contributor page, a page of its own at `/contribute/`, only after a
consent screen that says what is recorded, for what (including machine
learning), who sees it, for how long and where, and only when they tap Save.
The phone is known by an anonymous identity, never a name.
*(Superseded in part on 2026-10-24: a contribution now belongs to its
contributor's account, and editors see the account's name. Email and number
stay with the owner.)* A contribution is
never public and never live: nobody watches anyone move, and editors see a
recording only after it is saved.

## Consequences

- The public page carries no contributor code and no database client;
  `scripts/checks/check-build.mjs` proves it on every build.
- The database lets anonymous readers, the nightly publish among them, read
  nothing about contributions, and the publish proves it on every run.
- Raw points are kept 24 months, then only the cleaned line, the times and the
  hintos, cut short at each end and unlinked from the phone. A contributor can
  delete their recordings.
- Train tracking (planned) keeps its own rule: its features use the phone's
  location on the phone only.
- Rejected: sharing a location live; sign-in with an email (more friction, more
  personal data); invite-only links (too few contributors).
