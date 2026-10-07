// ESLint, flat config. It encodes the standards in .claude/CLAUDE.md.
//
// Every rule reports a warning for now. The standards postdate most of the
// tree, and the tree is being moved to them in stages; a rule flips to an
// error in its own change once no file trips it. `npm run lint` is not part
// of `npm run check` until then.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import checkFile from 'eslint-plugin-check-file';
import importX, { createNodeResolver } from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** 'error' becomes 'warn'; anything else is kept. */
const downgrade = (level) => (level === 'error' || level === 2 ? 'warn' : level);

/** The same configs with every rule at most a warning. */
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
      // Relative imports are resolved with TypeScript's extensions, so the
      // recommended checks (named, namespace, default, no-duplicates) can read
      // the module they point at. `@/` imports are left to tsc, which proves
      // every import anyway; that is why no-unresolved is off below.
      'import-x/extensions': ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
      'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx', '.mts', '.cts'] },
      'import-x/resolver-next': [
        createNodeResolver({
          extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
        }),
      ],
    },
    rules: {
      // TypeScript
      '@typescript-eslint/consistent-type-definitions': ['warn', 'interface'],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }],

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

      // Import direction (app → pages → features → shared → design-system) and
      // no deep imports into another feature. Until the move lands these match
      // nothing; scripts/checks/check-boundaries.mjs is the gate meanwhile.
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

      // File and folder names are kebab-case. Middle extensions (.stories, .d)
      // are ignored, so route-card.stories.tsx and vite-env.d.ts pass.
      'check-file/filename-naming-convention': [
        'error',
        { 'src/**/*.{ts,tsx,css}': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': ['error', { 'src/**/': 'KEBAB_CASE' }],

      // Logging: console.log never ships; warn and error are for real problems.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
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
