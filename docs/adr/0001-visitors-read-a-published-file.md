---
status: accepted
date: 2026-09-22
---

# Visitors read a published file, never the database

The public map at `/` reads one static file, `public/data/map.json`, rebuilt
from the studio's tables by a nightly workflow (and by hand on demand) and
committed to `main`. Visitors never call the database. We chose this over a
live read because it keeps the promise that a visitor asks nothing of anyone
— no account, no key in the browser, no request to a backend, so no coordinate
or identity can ever be sent — and because Cloudflare serves a static file
free and without limit while the database's free tier meters egress and
pauses for idleness. The map keeps working if the database is down or paused,
and git history keeps every published version.

## Consequences

- A change the editor saves is seen by visitors when it is published, not
  the moment it is saved. For a curated map that is the right way round.
- Anything the public map needs must be in the file: when a feature needs a
  new column (links, ends, informal names), the publish script grows with it.
- The publish script refuses a file that lost more than 30% of a table's
  rows, since an empty answer from the database is a normal HTTP 200.
