// ESLint, flat config. It encodes the standards in .claude/CLAUDE.md.
//
// `npm run lint` is part of `npm run check` and of CI's build job, so a
// regression fails the build rather than adding a warning nobody reads. The
// rules the standards name are errors (the block of rules below). The
// presets' rules are warnings until their own pass clears them (asWarnings,
// and the list above it): the standards postdate most of the tree, and a
// rule flips to an error in its own change once no file trips it.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import checkFile from 'eslint-plugin-check-file';
import importX, { createNodeResolver } from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** 'error' becomes 'warn'; anything else is kept. */
const downgrade = (level) => (level === 'error' || level === 2 ? 'warn' : level);

/**
 * The same configs with every rule at most a warning. What still warns, by
 * the pass that clears it (counts of 2026-10-07, after the pattern pass):
 *   the hooks pass      react-hooks/refs 32, set-state-in-effect 12,
 *                       immutability 10, exhaustive-deps 4, purity 1,
 *                       preserve-manual-memoization 1 (the React Compiler's
 *                       rules, each a behaviour question, not a rename)
 *   the non-null pass   @typescript-eslint/no-non-null-assertion 21
 *   the leftovers pass  @typescript-eslint/no-empty-function 8,
 *                       jsx-a11y/no-autofocus 4, preserve-caught-error 2,
 *                       @typescript-eslint/no-dynamic-delete 1,
 *                       no-control-regex 1, no-irregular-whitespace 1,
 *                       @typescript-eslint/no-unused-vars 1
 * A single-line disable carries its reason (`-- why`); there is no
 * file-wide disable.
 */
const asWarnings = (configs) =>
  configs.flat().map((config) =>
    config.rules
      ? {
          ...config,
          rules: Object.fromEntries(
            Object.entries(config.rules).map(([rule, setting]) => [
              rule,
              Array.isArray(setting)
                ? [downgrade(setting[0]), ...setting.slice(1)]
                : downgrade(setting),
            ]),
          ),
        }
      : config,
  );

const SOURCE = [
  'src/**/*.{ts,tsx}',
  '.storybook/**/*.{ts,tsx}',
  'vite.config.ts',
  'scripts/**/*.ts',
];

export default defineConfig([
  globalIgnores(['dist/', 'storybook-static/', 'node_modules/', 'public/', '.vite/', '.scratch/']),

  ...asWarnings([
    js.configs.recommended,
    tseslint.configs.strict,
    tseslint.configs.stylistic,
    reactHooks.configs.flat.recommended,
    jsxA11y.flatConfigs.recommended,
    importX.flatConfigs.recommended,
  ]).map((config) => ({ files: SOURCE, ...config })),

  {
    files: SOURCE,
    plugins: { 'check-file': checkFile },
    settings: {
      'import-x/internal-regex': '^@/',
      // Imports are resolved with TypeScript's extensions and tsconfig's paths
      // (`@/` is src/), so the recommended checks (named, namespace, default,
      // no-duplicates) and no-restricted-paths below read the module each
      // import points at, aliased or relative. no-unresolved stays off: tsc
      // proves every import resolves, and a package's export map is its
      // business.
      'import-x/extensions': ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
      'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx', '.mts', '.cts'] },
      'import-x/resolver-next': [
        createNodeResolver({
          extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
          tsconfig: { configFile: './tsconfig.json' },
        }),
      ],
    },
    rules: {
      // TypeScript
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' },
      ],

      // Imports: four groups, blank lines between, alphabetical within.
      // `tsc` already proves every import resolves, so the resolver rule is off
      // (it would need a resolver package to understand the `@/` alias).
      'import-x/no-unresolved': 'off',
      'import-x/no-default-export': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'unknown'],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Deep imports into a leaf feature, and imports from app/ or pages/, by
      // the specifier: the message names the rule. The direction itself is
      // no-restricted-paths below, which reads the resolved path.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // routes has no index.ts: Node runs the publish, the data check and the
              // unit tests against source files, and a barrel over routes would load
              // its map view (JSX, MapLibre) into them. Its concern folders are the API.
              group: [
                '@/features/*/*',
                '!@/features/*/index',
                '!@/features/routes/*',
                '!@/features/routes/*/*',
              ],
              message:
                'Import a feature through its index.ts, never its inner files (routes: through its concern folders).',
            },
            {
              group: ['@/app/*', '@/pages/*'],
              message:
                'Nothing imports from app/ or pages/; imports flow app → pages → features → shared.',
            },
          ],
        },
      ],

      // Who may import whom, by the resolved path (so a relative import that
      // leaves its area is caught too): app → pages → features → shared →
      // design-system, never upward; inside the design system foundation ←
      // primitives ← patterns; among the features routes first, then locator,
      // published-map and studio, which never import each other; the public
      // shell never imports the studio. Each zone is an importer (target) and
      // what it may not import (from). CSS is not linted: the only CSS
      // @imports are src/styles/global.css's, of the design system's tokens
      // and fonts, and a stylesheet imported from TypeScript is checked
      // through that import.
      'import-x/no-restricted-paths': [
        'error',
        {
          basePath: '.',
          zones: [
            {
              target: './src/design-system',
              from: ['./src/app', './src/pages', './src/features', './src/shared', './src/styles'],
              message: 'design-system/ is domain-free: it imports only itself.',
            },
            {
              target: './src/design-system/foundation',
              from: ['./src/design-system/primitives', './src/design-system/patterns'],
              message:
                'foundation ← primitives ← patterns: a lower layer never imports a higher one.',
            },
            {
              target: './src/design-system/primitives',
              from: ['./src/design-system/patterns'],
              message:
                'foundation ← primitives ← patterns: a lower layer never imports a higher one.',
            },
            {
              target: './src/shared',
              from: ['./src/app', './src/pages', './src/features', './src/styles'],
              message: 'shared/ knows nothing about any feature, page or app.',
            },
            {
              target: './src/styles',
              from: ['./src/app', './src/pages', './src/features'],
              message: 'styles/ imports only shared/ and the design system.',
            },
            {
              target: './src/features',
              from: ['./src/app', './src/pages'],
              message: 'Imports flow app → pages → features; a feature never imports upward.',
            },
            {
              target: './src/features/routes',
              from: [
                './src/features/locator',
                './src/features/published-map',
                './src/features/studio',
              ],
              message: 'routes comes first: it imports no other feature.',
            },
            {
              target: './src/features/locator',
              from: ['./src/features/published-map', './src/features/studio'],
              message: 'locator, published-map and studio never import each other.',
            },
            {
              target: './src/features/published-map',
              from: ['./src/features/locator', './src/features/studio'],
              message: 'locator, published-map and studio never import each other.',
            },
            {
              target: './src/features/studio',
              from: ['./src/features/locator', './src/features/published-map'],
              message: 'locator, published-map and studio never import each other.',
            },
            {
              target: './src/app/public-map',
              from: ['./src/app/studio', './src/features/studio'],
              message:
                'The public shell never imports the studio (ADR 0001): check-build.mjs proves it in the build too.',
            },
            {
              target: './src/app/studio',
              from: [
                './src/app/public-map',
                './src/features/locator',
                './src/features/published-map',
              ],
              message:
                'The studio shell imports studio, routes, shared, styles and the design system only.',
            },
          ],
        },
      ],

      // File and folder names are kebab-case. Middle extensions (.stories, .d)
      // are ignored, so route-card.stories.tsx and vite-env.d.ts pass.
      'check-file/filename-naming-convention': [
        'error',
        { 'src/**/*.{ts,tsx,css}': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': ['error', { 'src/**/': 'KEBAB_CASE' }],

      // Logging: console.log never ships; warn and error are for real problems.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  {
    // Every source file is in an area: app/<shell>/, pages/, features/<feature>/,
    // shared/, styles/ or design-system/. Vite's client types, vite-env.d.ts at
    // the top of src/, are the one exception.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/vite-env.d.ts'],
    rules: {
      'check-file/folder-match-with-fex': [
        'error',
        { '*.{ts,tsx}': 'src/{app,pages,features,shared,styles,design-system}/**/' },
      ],
    },
  },

  {
    // shared/ knows nothing about any feature.
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/app/*', '@/pages/*'],
              message: 'shared/ never imports from features/, pages/ or app/.',
            },
          ],
        },
      ],
    },
  },

  {
    // Storybook metas and config files are the only allowed default exports.
    files: [
      'src/**/*.stories.tsx',
      '.storybook/**/*.{ts,tsx}',
      'vite.config.ts',
      'eslint.config.js',
    ],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },
]);
