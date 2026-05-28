// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.js';

/**
 * Smoke test for the migrated Mantine app shell. Mounts <App /> against the
 * in-memory mock IPC bridge (the default behaviour of ipcBridge.getApi when
 * window.gingermail is missing) and confirms each tab renders.
 */
describe('App', () => {
  it('renders the title bar and all four tabs', async () => {
    render(<App />);
    expect(await screen.findByText('GingerMail')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /mail/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /calendar/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /tasks/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /settings/i })).toBeInTheDocument();
  });

  it('switches to the tasks tab and shows the add input', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: /tasks/i }));
    expect(await screen.findByPlaceholderText(/add a task/i)).toBeInTheDocument();
  });

  it('switches to settings and shows OAuth + manual buttons', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: /settings/i }));
    expect(await screen.findByRole('heading', { name: /add an account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^gmail$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^outlook$/i })).toBeInTheDocument();
  });
});
