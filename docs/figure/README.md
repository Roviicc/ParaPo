# The walker

The figure that stands for the visitor on the public map when they ask
"Where am I" (`src/commuter/useWhereAmI.ts`, `Walker.tsx`). What the app
loads is `public/figure/`: the sheet and the flying frame at 2× display
size, 256 colours, 47 KB together.

## Now: the commuter, rendered from a 3D model

Since 2026-09-26 the figure is a chibi commuter in a dark cap, white tee,
black trousers and white sneakers, with a backpack and a phone, drawn from
the owner's reference sheet `commuter-reference.png`. It is a 3D model
built from primitives in `commuter-3d.html` (three.js r128), and the
sprites are rendered from it, so every facing and every step comes from
the same figure:

    node scripts/render-figure.mjs

writes `public/figure/walker@2x.png` and `flying@2x.png`. Open
`commuter-3d.html` in a browser to see the same output without writing
anything. The sheet keeps the old layout, so the CSS did not change: 5
columns × 4 rows of 100 × 130, column 1 standing and columns 2–5 a walk
cycle a quarter-step apart; rows facing down, up, left, right; the soles 8
px above each cell's bottom and one scale for every cell. The flying frame
is the same figure level in the air, facing right, with three speed lines
behind.

The script quantises to 256 colours and writes indexed PNGs itself (median
cut, then `zlib`), because the installed app precaches both files and a
full-colour sheet was 185 KB.

## Before: the first figure, from an image generator

Drawn by the owner with an image generator on 2026-09-26 from the prompts
below. The masters here are the generator's output, cleaned (transparent
pixels cleared, cells cut onto one baseline by a script, not kept); the app
no longer loads them.

- `standing.png` — the character, front, 1017 × 1321.
- `walker-sheet.png` — 5 columns × 4 rows of 200 × 260: column 1 standing,
  columns 2–5 a walk cycle; rows facing down, up, left, right.
- `flying.png` — the same character flying, facing right, 1477 × 809. The
  app flips it to face left. Shown above 15 km/h: "I'm on a jeep, so I fly."

Prompt 1, the character:

> One cute chibi Filipino commuter, a small friendly figure with a round
> head, simple dot eyes, a light t-shirt, jeans and a small sling bag,
> standing still, facing the viewer. Flat vector style, thick clean
> outlines, soft pastel colors, no gradients, no shadows. Transparent
> background. Single figure centered, readable at 48 pixels tall. No text,
> no labels, no background, no other characters.

Prompt 2, the sheet, with prompt 1's image as the reference:

> A sprite sheet of exactly this character, keeping the same face, colors,
> clothes and proportions in every cell. Flat vector style, thick clean
> outlines, transparent background. Layout: a grid of 4 rows and 5 columns,
> every cell the same size, the character centered and the same size in
> every cell. Row 1: facing DOWN, toward the viewer. Row 2: facing UP, back
> to the viewer. Row 3: facing LEFT. Row 4: facing RIGHT. Column 1:
> standing still. Columns 2 to 5: a 4-frame walking cycle, legs and arms
> swinging, that loops back to frame 1. No text, no labels, no background,
> no other characters.

Prompt 3, flying, with the reference:

> Exactly this character flying like a superhero, side view facing RIGHT,
> body horizontal, one arm stretched forward, the other back, legs
> together, shirt blown back, three short speed lines trailing behind. Same
> flat vector style, colors and proportions. Transparent background, single
> figure centered, no text.
