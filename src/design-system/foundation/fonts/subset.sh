#!/bin/sh
# The six wired faces, subset to Latin from the owner's sources beside them.
# Run by hand when a source or the character list changes, and commit what it
# writes; the build only copies the results (no Python in the build).
# Made with fonttools 4.66.1 (pip install fonttools brotli), 2026-09-29.
#
# The list: Basic Latin and Latin-1 (ñ, é, the · and ×), the few extra
# letters and accents Filipino and English spelling meet (ı, Œ œ, ʻ ʼ, the
# spacing accents, the combining tilde of "ng̃"), General Punctuation (– — …
# ‹ › and the quotes), the peso sign, the arrows the cards draw (→ ↔ ⇄), the
# minus and ≈, ✓ and ✕, and the BOM and replacement character. Every
# character in src/ and the published map was in it on 2026-09-29; one the
# fonts do not carry falls back to the system face, as before.
# `tnum` and `case` are kept with the default features: the app sets
# tabular-nums.
set -e
cd "$(dirname "$0")"
U="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0303,U+2000-206F,U+20B1,U+2190-2199,U+21C4,U+2212,U+2248,U+2713,U+2715,U+FEFF,U+FFFD"
for f in Regular Medium SemiBold Bold Black; do
  pyftsubset "SNPro/SNPro-$f.ttf" --unicodes="$U" --layout-features+=tnum,case --flavor=woff2 --output-file="SNPro/SNPro-$f.woff2"
done
pyftsubset Cubao/cubao-free-regular.otf --unicodes="$U" --layout-features+=tnum,case --flavor=woff2 --output-file=Cubao/cubao-free-regular.woff2
