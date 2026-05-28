import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Root vitest config (used when running `pnpm test:all` from the workspace root).
 * Individual packages have their own vitest.config.ts where needed (renderer,
 * ui-kit) so they get React + jsdom. Pure-logic packages inherit this one and
 * run in plain Node.
 */
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const setupFile = path.join(rootDir, 'test/setup.ts');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/src/**/*.test.ts', '**/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/e2e/**', '**/src/**/*.test.tsx'],
    setupFiles: [setupFile],
  },
});
