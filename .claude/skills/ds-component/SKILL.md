---
name: ds-component
description: Build or restyle one ParaPo component, end to end — the owner's Figma design to code, tokens, stories, verification and an independent ds-reviewer pass. Use when building or restyling a component during the visitor redesign. Runs in the main session because it stops to ask the owner.
---

# Build one PalimosPoDesignSystem component

Follow in order. Do not skip step 6.

**One component per run.** If asked for several, do them one at a time, each
with its own checker pass and commit.

## Before you start

- **The owner designs; you implement.** The design must exist in his Figma
  file (Para Po, key `MGPQFPjemLbzjNqAI5Ny4D`). If a state is not designed —
  hover, error, empty, phone — **stop and ask him**, never invent it: an
  invented state silently becomes the design.
- If the design uses variables the code lacks, run `/sync-tokens` first.
- Read the screen captures on the Research board's "Screenshot V2" page for
  what the component looks like today.

## 1. Read the design, then the code it replaces

Get the Figma node (get_design_context / get_screenshot, with the
figma-design-to-code skill) and read the current component and its stories.
The current component's behaviour — taps, test ids, props the apps pass —
is load-bearing; the redesign restyles it, the headless suites still have
to pass.

## 2. Props from Figma's names, verbatim

If the design calls it `livery`, the prop is `livery`. Add a prop only if
two call sites would otherwise reinvent it: props are easy to add and
nearly impossible to remove.

## 3. Every colour is a token name

Colour comes from `src/design-system/foundation/tokens.css`: `text-content-primary`,
`bg-surface`, `bg-card-red-surface`. Never hex. Never the raw palette
(`text-neutral-900`) in restyled code — it works silently here, which is
exactly why it drifts. Sizes and spacing use Tailwind's scale (the Figma
primitives are that scale). Make rule-breaking unsayable: no `style`
pass-through, no `dangerouslySetInnerHTML`, no `any` or `as never` to make
something fit.

## 4. Files, the house way

`<Name>.tsx` beside `<Name>.stories.tsx`. A design-system component
lives in its PalimosPoDesignSystem layer — `src/design-system/primitives/`
for single elements, `patterns/` for compositions of them — and is
domain-free: no routes, no hintuans. An app component that merely uses
the system stays in its area. No barrels, no types file — types live
with the component. Comments say why, with dates and the owner's
decisions, in the voice of the files around them. Boundaries hold —
foundation ← primitives ← patterns ← the apps
(`node scripts/checks/check-boundaries.mjs`).

**Class maps are literal**, and checked:

```ts
const SURFACE = {
  red: 'bg-card-red-surface',
  orange: 'bg-card-orange-surface',
} satisfies Record<Livery, string>
```

Never `` `bg-card-${livery}-surface` `` — Tailwind scans source text and a
built name produces no CSS and no error (it emptied the tokens page's
ramps on 2026-09-28; only a screenshot caught it).

## 5. Stories, then look at them

One story per variant, plus the component's real states, plus one phone
specimen (`@container` decorator, as `route-card.stories.tsx` does).

```bash
npm run build-storybook
```

then serve `storybook-static` and screenshot the stories with Playwright
(chromium, `iframe.html?viewMode=story&id=<story-id>`), and **look at the
screenshots**. A component that typechecks and renders wrong is the
failure this step exists to catch.

Run `npm run check` before moving on. Do not start anything on port 5173 —
the owner's dev server owns it — and run at most two headless browsers.

## 6. Checker pass — then commit

Spawn the `ds-reviewer` agent on the changed files. It is read-only, it
has not seen your reasoning, and it reports rather than fixes.

Fix what it finds, then have it look again. **"Done" means the checker
said PASS**, not that you think it is finished.

Then commit in the repo's voice — what changed and why, the owner's
decisions dated — and push to the working branch.

## Stop and ask the owner

Two points, for at least the first two components:

1. **After reading the design, before writing code.** Show the props,
   variants and states you are about to build, in Figma's own names.
   Corrections are cheap here and expensive later.
2. **After the checker's findings, before fixing them.** So the owner can
   judge whether the reviewer earns its keep.

After two components, ask whether to keep the first stop.
