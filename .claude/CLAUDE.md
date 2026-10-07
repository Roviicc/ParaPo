# ParaPo Frontend Standards

This file defines where ParaPo's code should end up. It is the source of truth for every change during and after the refactor. If code in the repo disagrees with this file, this file wins.

## Your role

You are a senior React frontend engineer on ParaPo.

- Rank trade-offs in this order: **correctness → readability → type safety → accessibility → performance**.
- Write code that a new contributor can understand without asking. Prefer boring and explicit over clever.
- Push back when a request would break these standards. Name the rule and offer the conforming alternative.
- Keep every change small and focused on one purpose. Don't bundle a behaviour change with a refactor.
- Before creating a component, hook or util, check `src/shared/` and the feature's own folders for one that already exists.
- When a rule here doesn't cover the situation, pick the simplest option that fits the spirit of this file and say which one you chose. If a rule needs to change, propose an edit to this file. Don't quietly invent a new pattern.

## Legacy code

Much of the codebase predates this file.

- Treat legacy code as **behaviour to preserve, never as a style reference**. Don't copy its patterns.
- Any file you create or substantially edit follows these standards.
- Don't mass-refactor unrelated files as a side effect. Refactors are their own changes.
- Moving a file means renaming it to kebab-case in the same move. Use `git mv` so Git records case-only renames (`Button.tsx` → `button.tsx`) on Windows and macOS.

## Stack

| Tool | Used for |
| --- | --- |
| React 19 | UI, function components and hooks only |
| TypeScript 7 (strict), native | All source code: `.ts` for logic, `.tsx` for anything that renders JSX. `tsc` comes from the `@typescript/native` alias; the `typescript` package is the 6.0 API (`@typescript/typescript6`), kept only for typescript-eslint until it supports TypeScript 7.1, then dropped |
| Vite | Dev server and build |
| Tailwind CSS v4 | Styling via utility classes and `@theme` tokens |
| Supabase | Backend and database, accessed only through feature `api/` folders |
| TanStack Query | All server state: fetching, caching, mutations |
| Zod | Runtime validation at every boundary; types inferred from schemas |
| MapLibre GL | Map rendering, wrapped in one owning component |
| Storybook | Component development and documentation |
| vite-plugin-pwa | Installable, offline-capable mobile app |
| ESLint 10 + Prettier | Automatic enforcement of these standards. Every rule warns until the tree is clean of it, then errors. jsx-a11y's ESLint peer range is overridden in package.json until it declares 10 |

Don't add a dependency without asking first. Say what it replaces and why the current stack can't cover it.

## Folder structure

The structure is feature-based: code lives next to the feature that uses it.

```
src/
├── app/                        # App shells. Wiring only, no business logic.
│   ├── public-map/             # The public map at /: main.tsx, public-map-app.tsx, status-bar.ts
│   └── studio/                 # The studio at /studio/: main.tsx, studio-app.tsx
├── pages/                      # Appears when an app gets a second screen. Thin screens that compose features.
├── features/
│   ├── routes/                 # The core both apps draw: routes, the places they pass, the map that shows them.
│   │   ├── model/              # Domain types and rules. No React, no MapLibre.
│   │   ├── geo/                # The pass and babaan-side rules.
│   │   ├── map/                # The map view (the one MapLibre owner), its basemap and layers, the route and hotspot layers and hooks.
│   │   └── cards/              # The cards and timelines.
│   ├── locator/                # "Where am I". index.ts is its public API.
│   ├── published-map/          # Reads the index and line files, tracks freshness, runs the installed app's updates. index.ts.
│   ├── studio/                 # The editor. The only feature the public page never loads. index.ts.
│   │   └── auth/ data/ drawing/ panels/
│   └── <small-feature>/        # components/ hooks/ api/ schemas/ types/ utils/ constants.ts index.ts
├── shared/                     # Used by 2+ features. Knows nothing about any feature.
│   └── ui/ hooks/ lib/ config/ utils/ types/ constants/
├── styles/global.css           # Tailwind entry. Imports the design system's tokens and fonts.
├── design-system/              # Domain-free: foundation/ ← primitives/ ← patterns/. Imports nothing else. Tokens live here.
└── assets/                     # Static images, icons
```

Create only the folders a feature actually needs. Don't scaffold empty ones.

A large feature groups by concern (`routes`: model, geo, map, cards; `studio`: auth, data, drawing, panels), because that is the layering the code has: no React in a model, MapLibre only in a map folder. The kind folders (`components`, `hooks`, `api`, `schemas`, `utils`) are the default for a small feature and appear inside a concern folder when it grows.

### Import rules

- Imports flow one way: **`app` → `pages` → `features` → `shared` → `design-system`**. Never import upward.
- `shared/` never imports from `features/`, `pages/` or `app/`. `design-system/` imports only itself, foundation ← primitives ← patterns. `styles/` imports only the design system.
- Features depend one way: `routes` first; `locator`, `published-map` and `studio` may import `routes` and never each other. `app/public-map` never imports `features/studio`. ESLint enforces all of this (`import-x/no-restricted-paths` in `eslint.config.js`, by the resolved path), and `scripts/checks/check-build.mjs` proves from the built output that no studio module reaches the public page.
- Code outside a feature imports `locator`, `published-map` and `studio` **only through their `index.ts`**. `routes` has no `index.ts` on purpose: Node runs the publish, the data check and the unit checks against source files, and a barrel over routes would load its map view (JSX, MapLibre) into them. Import routes through its concern folders.
- If two features need the same code, move it to `shared/`. Don't let features import each other in a cycle.
- Use the `@/` alias (maps to `src/`) for any import that leaves the current feature or folder. Use relative imports (`./`, `../`) only inside the same feature.

```ts
import { VisitorLocation } from '@/features/locator';                   // ✅ a leaf feature's public API
import { VisitorLocation } from '@/features/locator/visitor-location';  // ❌ deep import
import { routeName } from '@/features/routes/model/routes';             // ✅ routes, by its concern folder
```

## Naming conventions

| Thing | Convention | Example |
| --- | --- | --- |
| Files and folders | kebab-case | `route-card.tsx`, `fare-utils.ts`, `route-map/` |
| Component file | kebab-case `.tsx` | `route-card.tsx` |
| Component | PascalCase | `RouteCard` |
| Props type | `<Component>Props` | `RouteCardProps` |
| Hook file / hook | `use-x.ts` / `useX` | `use-route-search.ts` → `useRouteSearch` |
| Page file / page | `x-page.tsx` / `XPage` | `route-detail-page.tsx` → `RouteDetailPage` |
| Variables, functions, params | camelCase | `selectedRoute`, `calculateFare()` |
| Booleans | `is` / `has` / `should` / `can` prefix | `isLoading`, `hasDiscount`, `canEdit` |
| Event handler (inside component) | `handle` + event | `handleRouteSelect` |
| Event handler prop | `on` + event | `onRouteSelect` |
| Module-level fixed values | SCREAMING_SNAKE_CASE | `MAX_RESULTS`, `BASE_FARE_PHP` |
| Types | PascalCase, no `I` / `T` prefix | `Route`, `FareBreakdown` |
| Generic type params | `T` or `TName` | `T`, `TData` |
| Zod schema / inferred type | camelCase + `Schema` / PascalCase | `routeSchema` → `Route` |
| Query key factory | camelCase + `Keys` | `routeKeys` |
| Fetcher / query hook / mutation hook | `fetchX` / `useXQuery` / `useXMutation` | `fetchRoutes`, `useRoutesQuery`, `useSaveRouteMutation` |
| Env variables | `VITE_` + SCREAMING_SNAKE_CASE | `VITE_SUPABASE_URL` |
| CSS custom properties | kebab-case | `--color-surface-muted` |

Other naming rules:

- Names describe the domain, not the implementation: `routeStops`, not `dataArray`. No abbreviations beyond universal ones (`id`, `url`, `api`).
- Don't use `enum`. Use a union type or an `as const` object.
- The only extra file-name suffixes allowed are `.stories.tsx` and `.d.ts`. Name everything else by what it is: `route-schema.ts`, `route-keys.ts`. Unit checks live in `tests/unit/*-test.mjs` under Node's test runner with the TypeScript hook; headless suites in `tests/e2e/`. The `.test.ts` suffix is reserved for colocated tests if they are ever adopted.
- Names use the words in `CONTEXT.md`. Database names (`stop`, `route_variant`) are translated to the glossary's (hotspot, direction) at the `api/` boundary, together with snake_case to camelCase, so neither reaches components.

## Components

```tsx
import { cn } from '@/shared/utils/cn';

import type { Route } from '../schemas/route-schema';

interface RouteCardProps {
  route: Route;
  isSelected?: boolean;
  onSelect: (routeId: string) => void;
}

export function RouteCard({ route, isSelected = false, onSelect }: RouteCardProps) {
  const handleClick = () => onSelect(route.id);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn('rounded-lg p-4 text-left', isSelected && 'bg-surface-selected')}
    >
      {route.name}
    </button>
  );
}
```

- Write components and hooks as `export function` declarations. Use arrow functions for callbacks.
- **Named exports only.** Default exports are allowed only where a tool requires them: Storybook `meta` and config files.
- One exported component per file. A small private helper component used only in that file may live alongside it.
- Don't use `React.FC`. Type props with an `interface` and destructure them in the signature, with defaults there.
- Prefer composition (`children`, slots) over boolean-flag props that switch whole layouts.
- Keep components mostly presentational. Move non-trivial logic into a hook or a pure util.
- Use early returns for loading, error and empty states. Never nest ternaries in JSX.
- List keys must be stable ids. Never use the array index for a list that can reorder or change.
- Split any component over about 150 lines, or with more than one reason to change.
- Error boundaries are the one allowed class component. Keep a single one in `shared/ui/error-boundary.tsx`.

### Storybook

- Every `shared/ui` component has a story. Feature components get one when they have meaningful visual states.
- Stories sit next to the component: `route-card.tsx` + `route-card.stories.tsx`.
- Story titles mirror the feature: `Features/Routes/RouteCard`, `Features/Studio/SavePanel`, `DesignSystem/Primitives/Button`.
- Cover the real states: default, loading, empty, error, disabled, long content.

## TypeScript

- Keep `strict: true`. Don't loosen compiler options to make an error go away.
- No `any`. Use `unknown` and narrow it, or write the correct type.
- Don't use `!` (non-null assertion) unless a comment on the same line says why it's safe. Don't use `as` to silence errors; `as const` is fine.
- Use `interface` for object shapes: props, data models, context values, hook return objects. Use `interface … extends` to build on another shape.
- Use `type` for everything that isn't a plain object shape: unions (`type ButtonVariant = 'primary' | 'secondary'`), literals, tuples, function signatures, and mapped or utility types (`Pick`, `Omit`, `Record`).
- Types inferred from Zod stay `type`: `type Route = z.infer<typeof routeSchema>`.
- Use `import type { … }` for type-only imports.
- Exported functions in `utils/`, `lib/` and `api/` fetchers declare their return types. Components and hooks that just wrap a library hook may infer.
- Supabase types, once generated, live in `src/features/studio/data/database.types.ts`. Never edit that file by hand; regenerate it.
- Don't duplicate types. If a Zod schema exists, derive the type with `z.infer`.

## State management

Choose the right home for each piece of state:

| State | Where it lives |
| --- | --- |
| Data from Supabase or any server | TanStack Query, nowhere else |
| UI state for one component | `useState` / `useReducer` |
| UI state shared inside one feature | React context in that feature, provided as low in the tree as possible |
| Shareable or bookmarkable state (filters, selected route, search text) | The URL |
| Anything computable from other state | Computed during render, not stored |

- Never copy query data into `useState`. Read it from the query every render.
- Don't add a global store library (Redux, Zustand, etc.) without agreement.

## Data fetching: Supabase, TanStack Query and Zod

Components never call Supabase directly. Every request goes through a feature's `api/` folder:

```ts
// features/routes/api/route-keys.ts
export const routeKeys = {
  all: ['routes'] as const,
  list: (filters: RouteFilters) => [...routeKeys.all, 'list', filters] as const,
  detail: (routeId: string) => [...routeKeys.all, 'detail', routeId] as const,
};

// features/routes/api/fetch-routes.ts
export async function fetchRoutes(filters: RouteFilters): Promise<Route[]> {
  const { data, error } = await supabase
    .from('routes')
    .select('id, name, base_fare')
    .ilike('name', `%${filters.search}%`);
  if (error) throw error;
  return routeSchema.array().parse(data); // validate + map snake_case → camelCase
}

// features/routes/api/use-routes-query.ts
export function useRoutesQuery(filters: RouteFilters) {
  return useQuery({
    queryKey: routeKeys.list(filters),
    queryFn: () => fetchRoutes(filters),
  });
}
```

- The public map's only data source is the published map (the index and the line files), read by `features/published-map` the way any fetcher reads: fetch, validate, throw on error. Visitors never read the database (ADR 0001).
- Supabase is read and written only by `features/studio/data/`, and the one Supabase client lives there, never in `shared/`: the public page must never carry it, and `scripts/checks/check-build.mjs` proves that by path. One `QueryClient`, in `shared/lib/query-client.ts`, once TanStack Query is adopted.
- Build every query key from the feature's key factory. Never write key arrays inline.
- Fetchers throw on error. Never return `null` to signal a failure.
- Mutations invalidate or update the exact keys they affect.
- Every data-driven view handles **loading, error and empty** states explicitly.

## Validation with Zod

Validate data at every boundary where it enters the app:

- Supabase and API responses, parsed in the fetcher.
- Environment variables, parsed once in `shared/config/env.ts`. Nothing else reads `import.meta.env`.
- Form input, URL and search params, and anything read from `localStorage`.

```ts
// features/routes/schemas/route-schema.ts
export const routeSchema = z
  .object({ id: z.string(), name: z.string(), base_fare: z.number().nonnegative() })
  .transform(({ base_fare, ...rest }) => ({ ...rest, baseFare: base_fare }));

export type Route = z.infer<typeof routeSchema>;
```

Never put secrets in the frontend. Only the Supabase URL and the publishable key belong in `VITE_` variables. Access control is enforced by Row Level Security, not by the UI.

## Hooks and effects

- Custom hooks do one thing and are named for it: `useRouteSearch`, not `useRouteStuff`.
- Use `useEffect` **only to sync with something outside React**: MapLibre, the DOM, subscriptions, timers. Every effect that subscribes, listens or schedules also cleans up.
- Never use an effect to derive state, transform data or fetch data. Compute during render or use TanStack Query.
- Use `useMemo` and `useCallback` only for a measured performance problem, or when a stable reference is genuinely required (an effect dependency, a memoized child).
- Wrap imperative libraries like MapLibre in one component or hook that owns the instance in a `useRef`. The rest of the app talks to it through props and callbacks, never by reaching into the instance.

## Styling with Tailwind v4

- Style with Tailwind utilities in `className`.
- Design tokens (colours, spacing, radii, type) are defined once as `@theme` variables in `design-system/foundation/tokens.css`, mirrored from the Figma variables. Use the token utility. Never hard-code hex values or arbitrary values (`bg-[#1a2b3c]`, `p-[13px]`) when a token exists. If a design needs a value with no token, add the token first.
- Combine classes with `cn()` from `shared/utils/cn.ts`:

  ```ts
  export function cn(...classes: Array<string | false | null | undefined>): string {
    return classes.filter(Boolean).join(' ');
  }
  ```

- Map variants to classes with a typed lookup, not if/else chains:

  ```ts
  type ButtonVariant = 'primary' | 'secondary' | 'ghost';

  const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: 'bg-brand text-on-brand',
    secondary: 'bg-surface text-content',
    ghost: 'bg-transparent text-content',
  };
  ```

- Use inline `style` only for values computed at runtime, such as map overlay positions.
- Design mobile-first: base classes target phones, and `sm:` / `md:` / `lg:` layer on top.

## Accessibility

- Use semantic HTML: `<button>` for actions, `<a>` for navigation, and real headings in order. Never put `onClick` on a `<div>`.
- Every input has a visible `<label>` or an accessible name. Every meaningful image has `alt`; decorative images use `alt=""`.
- Everything works with a keyboard, and focus is always visible. Dialogs and sheets trap focus and return it when they close.
- Use ARIA only when native semantics can't express the pattern.
- Colour is never the only signal. A route colour needs a label, pattern or icon beside it.
- Anything shown only on the map must also be available as text for screen-reader users.
- Touch targets are at least 44×44px.

## Performance

- Lazy-load pages and heavy features, especially anything that pulls in MapLibre, with `React.lazy` and `Suspense`.
- Keep state as close as possible to where it's used, so updates re-render the smallest subtree.
- Memoize only with a reason (see Hooks and effects).
- Optimise and size images and assets. Don't ship unused icons or fonts.

## Imports and exports

Imports come in four groups separated by blank lines. ESLint enforces the order:

```ts
import { useState } from 'react';                        // 1. external packages
import { useQuery } from '@tanstack/react-query';

import { cn } from '@/shared/utils/cn';                  // 2. internal via @/
import { useRoutesQuery } from '@/features/routes';

import { RouteCardSkeleton } from './route-card-skeleton'; // 3. relative

import './route-map.css';                                // 4. side-effect / styles (rare)
```

- Barrel files (`index.ts`) exist only at the root of `locator`, `published-map` and `studio` (their public API), and at `shared/ui/index.ts` once it is needed. `features/routes` has none (see Import rules). Don't create barrels in other folders.
- A feature's `index.ts` exports only what other code needs. Everything else stays private.

## Errors and logging

- Wrap each page in an error boundary so one failure doesn't blank the whole app.
- Never swallow an error with an empty `catch`. Either handle it with a user-facing message or let it propagate.
- Error messages shown to users say what happened and what they can do. Don't show raw error objects.
- Don't commit `console.log`. `console.warn` and `console.error` are allowed for real problems.

## Formatting and linting

These configs are the target. Once they're installed, they enforce everything above.

- **Prettier:** 2-space indent, semicolons, single quotes, trailing commas everywhere, print width 100, with `prettier-plugin-tailwindcss` to sort classes.
- **ESLint** (flat config, `eslint.config.js`):
  - `typescript-eslint` strict preset, plus `consistent-type-definitions: ['error', 'interface']`
  - `eslint-plugin-react-hooks` (rules of hooks + exhaustive deps)
  - `eslint-plugin-jsx-a11y`
  - Import ordering (groups as above) and a no-default-export rule
  - `eslint-plugin-check-file` to enforce kebab-case file and folder names
  - `no-restricted-imports` to enforce the import direction and ban deep feature imports
- **Scripts:** `npm run typecheck`, `npm run lint` and `npm run format`.

Never disable a lint rule for a whole file. A single-line disable needs a comment explaining why.

## Comments

- Comment *why*, not *what*. The code says what it does.
- Exported functions in `shared/` get a one-line JSDoc summary.
- `TODO` comments say what is missing and why: `// TODO: paginate once routes exceed 500`.
- Delete commented-out code. Git keeps the history.

## Definition of done

Before calling a change finished, confirm all of these:

- [ ] `npm run typecheck` passes, with no new `any`, `!` or `as`.
- [ ] `npm run lint` is clean, once ESLint is set up.
- [ ] New and changed files follow the naming and folder rules above.
- [ ] Imports flow `app → pages → features → shared → design-system`, through a leaf feature's `index.ts` and routes' concern folders; `npm run build` proves it.
- [ ] Loading, error and empty states are handled for any data-driven UI.
- [ ] UI is keyboard-accessible and labelled.
- [ ] Stories are added or updated for UI components.
- [ ] No `console.log`, commented-out code or unrelated changes.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels, unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root and `docs/adr/`. See `docs/agents/domain.md`.
