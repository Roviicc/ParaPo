---
name: sync-tokens
description: Diff the Figma file's variables against src/design-system/foundation/tokens.css and apply the changes, the same way every time. Use when the owner says the variables changed, or before building a component whose design uses tokens the code may lack.
---

# Sync the Figma variables into tokens.css

The Figma file is PalimosPoDesignSystem's source of truth for tokens; `src/design-system/foundation/tokens.css`
is its mirror; `src/design-system/foundation/Tokens.stories.tsx` is the visible check. This
skill reads Figma, diffs, applies, and proves it.

## 1. Read Figma

Load the `figma:figma-use` skill, then run one read-only `use_figma` on
file `MGPQFPjemLbzjNqAI5Ny4D` returning, for every collection: name, modes,
total count, and for (a) the whole **Semantics** collection and (b) the
**Primitive** families the code owns (`mauve`, `olive`, `mist`, `taupe`,
`color/neutral/150` and anything not in Tailwind v4), each variable's name
and value — aliases as the target's name, colours as hex.

If the Figma MCP tools are not available in this session, stop and say so;
do not guess values.

## 2. Diff against the mirror

What the code mirrors and how names map:

| Figma | tokens.css | utility |
|---|---|---|
| Content/primary | `--content-primary` + `--color-content-primary` | `text-content-primary` |
| Border/primary | `--border-primary` + inline alias | `border-border-primary` |
| Background/surface-x | `--surface-x` + inline alias | `bg-surface-x` |
| Card/red/Timeline/surface | `--card-red-timeline-surface` (path flattened, lowercased) | `bg-card-red-timeline-surface` |
| Brand/surface | `--brand-surface` + inline alias | `bg-brand-surface` |
| color/mist/300 (custom primitive) | `--color-mist-300` in the plain `@theme` block | `bg-mist-300` |

Semantic values go in the `:root` block as `var(--color-…)` aliases —
never a raw hex there — and each gets its `@theme inline` line. A new
mode in Figma (Dark) becomes a new block redefining the same `:root`
properties, nothing else.

**Needs no mirroring:** primitives whose values are Tailwind v4's own
(they match hex for hex — verify on any new family before assuming);
negative spacing (`spacing/-0-5` — Tailwind derives negatives);
`skew/*`; fonts, until the app actually loads the font files;
`font/leading`, `tracking`, `breakpoint`, `container` — Tailwind's scale
already is the Figma value.

## 3. Apply

- Edit `tokens.css`: keep the file's comment voice, group order and the
  Light-block structure.
- Update `Tokens.stories.tsx` so every token shows: new semantics get a
  swatch or text line, new custom families a `Ramp` — with **literal**
  class names written out (Tailwind cannot see built names; the empty
  ramps of 2026-09-28 are the warning).
- Renames in Figma rename the token here too, and every usage of the old
  class in `src/` (grep for it).
- A **Map/…** semantic is also written into
  `src/design-system/foundation/mapColours.ts`, keyed by its Figma name, as
  the hex of the primitive it aliases: the map's paint (MapLibre) reads
  neither var() nor Tailwind's oklch. `npm run test:map-colours` fails
  until the two agree.

## 4. Prove and record

```bash
npm run build
npm run build-storybook
```

Both green. If anything beyond the mirror changed (a rename touching
components), run the headless suites the change reaches — at most two at
once, never against port 5173's owner.

Commit in the repo's voice, listing each change as Figma names it, and
push. Tell the owner what changed in a table: token, old, new.
