# PalimosPoDesignSystem fonts

The owner's files, dropped 2026-09-28: SN Pro's sixteen static cuts in
`SNPro/`, Cubao Free's three (narrow, regular, wide) in `Cubao/`.

**Wired** (fonts.css, as woff2 subset to Latin from these sources by
`subset.sh`, which says what the subset holds and how to run it again):
SN Pro 400 / 500 / 600 / 700, its Black 900 (the route cards' titles, the
same day), and Cubao Free Regular. The six weigh 109 kB together, from
290 kB whole (2026-09-29); the build copies them and runs no Python. Everything else stays here
unwired — italics, the extra weights, Cubao narrow and wide — until a
design uses one; wiring a face is one @font-face block and, if new to
the scale, one token.
