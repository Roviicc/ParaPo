import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs/ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: '@storybook/react-vite',
  core: { disableTelemetry: true },
  // Storybook loads vite.config.ts, which carries the installable app's
  // plugin. Stories are not an app: no worker, no manifest, and the precache
  // step would look for a build manifest Storybook never writes.
  viteFinal(config) {
    const isPwa = (p: unknown) =>
      !!p && typeof p === 'object' && 'name' in p && /^(vite-plugin-pwa|parapo:studio-without-manifest)/.test(String(p.name))
    config.plugins = (config.plugins ?? []).flat().filter((p) => !isPwa(p))
    return config
  },
}

export default config
