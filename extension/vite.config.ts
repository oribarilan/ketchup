/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';
import { execSync } from 'node:child_process';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'fs-gen-rules',
      buildStart() {
        // Regenerate public/rules.json from the plugin registry before bundling.
        // Runs in Node via tsx so the registry's .meta.ts files are importable.
        execSync('npx tsx scripts/gen-rules.ts', { stdio: 'inherit' });
      },
    },
    crx({ manifest }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
