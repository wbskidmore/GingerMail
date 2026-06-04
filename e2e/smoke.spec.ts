import { test, expect } from '@playwright/test';

/**
 * Smoke test - validates that the Mantine-migrated renderer boots in a browser
 * and that the four tabs render their empty states without throwing.
 *
 * We run against `pnpm dev` (Vite) with the in-memory IPC mock from ipcBridge.ts,
 * so no Electron main process or signed bundle is required. A full Electron e2e
 * harness is tracked separately.
 */
test('boots the four tabs', async ({ page }) => {
  await page.goto('/');

  // The titlebar should be present
  await expect(page.getByText('GingerMail', { exact: true })).toBeVisible();

  // All four tabs render
  await expect(page.getByRole('tab', { name: /mail/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /calendar/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /tasks/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /settings/i })).toBeVisible();

  // Mail tab shows the no-accounts empty state (because the mock returns [])
  await expect(page.getByText(/no mail accounts yet/i)).toBeVisible();

  // Calendar tab works
  await page.getByRole('tab', { name: /calendar/i }).click();
  await expect(page.getByText(/no events in this range/i)).toBeVisible();

  // Tasks tab shows the input
  await page.getByRole('tab', { name: /tasks/i }).click();
  await expect(page.getByPlaceholder(/add a task/i)).toBeVisible();

  // Settings tab shows the accounts add card
  await page.getByRole('tab', { name: /settings/i }).click();
  await expect(page.getByRole('heading', { name: /add an account/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gmail' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Outlook' })).toBeVisible();
});

test('focus mode hotkey toggles overlay', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^focus$/i }).click();
  await expect(page.getByRole('heading', { name: /focus mode/i })).toBeVisible();
  await page.getByRole('button', { name: /end/i }).click();
});
