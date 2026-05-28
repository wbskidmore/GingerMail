// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { FocusOverlay } from './FocusOverlay.js';
import { gingermailTheme } from './theme.js';

describe('FocusOverlay', () => {
  it('renders nothing when not active', () => {
    const { container } = render(
      <MantineProvider theme={gingermailTheme}>
        <FocusOverlay state={{ active: false }} onStop={() => {}} />
      </MantineProvider>,
    );
    expect(container.querySelector('.mantine-Affix-root')).toBeNull();
  });

  it('shows the remaining time and stop button when active', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    const endsAt = Date.now() + 5 * 60_000;
    render(
      <MantineProvider theme={gingermailTheme}>
        <FocusOverlay state={{ active: true, endsAt, startedAt: Date.now(), durationMin: 5 }} onStop={onStop} />
      </MantineProvider>,
    );
    expect(screen.getByText(/focus mode/i)).toBeInTheDocument();
    expect(screen.getByText(/notifications paused/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /end/i }));
    expect(onStop).toHaveBeenCalled();
  });
});
