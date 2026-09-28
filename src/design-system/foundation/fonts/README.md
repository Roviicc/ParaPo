# PalimosPoDesignSystem fonts

Drop the font files straight into this folder — that is what it is for:

- **Cubao Free** — Regular. One file.
- **SN Pro** — the variable file, or Regular (400) + Medium (500).

`.woff2` preferred; `.woff`, `.ttf` or `.otf` are fine too, any filename.
Then say so, and the `@font-face` rules, the fallback stacks and the
`--font-*` tokens (Figma's `font/family/Cubao` and `font/family/SNPRO`)
get wired to whatever landed here. Until then the app's system stack
stands in, and no token pretends otherwise.
