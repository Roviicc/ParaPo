import { renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * The contributor page's build for the Android app: that page only, no worker, no map file, none
 * of the public map's data. Capacitor serves dist-apk/ from its root, so the page moves from
 * dist-apk/contribute/index.html to dist-apk/index.html. Run with `--mode apk`, which reads
 * .env.apk and never .env.production, so the app cannot reach the project's database.
 */
function pageAtTheRoot(): Plugin {
  return {
    name: 'parapo:apk-page-at-the-root',
    apply: 'build',
    writeBundle(options) {
      const out = options.dir;
      if (!out) throw new Error('the app build has no output folder');
      renameSync(`${out}/contribute/index.html`, `${out}/index.html`);
      rmSync(`${out}/contribute`, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pageAtTheRoot()],
  publicDir: false,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: 'dist-apk',
    emptyOutDir: true,
    rolldownOptions: { input: { contribute: 'contribute/index.html' } },
  },
});
