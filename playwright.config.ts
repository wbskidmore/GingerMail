import { defineConfig, devices } from '@playwright/test';

/**
 * GingerMail end-to-end test config.
 *
 * For dev speed we run Playwright against the renderer running in plain
 * Vite (npm run dev:renderer), with the IPC bridge stubbed by
 * `apps/renderer/src/ipcBridge.ts` (it falls back to an in-memory shim when
 * window.gingermail is not present, exactly what happens in a regular browser).
 *
 * A full Electron e2e harness (electron-playwright-helpers + signed build)
 * is tracked separately in docs/QA.md.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm --filter @gingermail/renderer dev --strictPort --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
