// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider, Button } from '@mantine/core';
import { SnoozeMenu } from './SnoozeMenu.js';
import { gingermailTheme } from './theme.js';

describe('SnoozeMenu', () => {
  it('opens the menu and calls onSelect with a preset', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <MantineProvider theme={gingermailTheme}>
        <SnoozeMenu target={<Button>Open snooze</Button>} onSelect={onSelect} />
      </MantineProvider>,
    );
    await user.click(screen.getByRole('button', { name: /open snooze/i }));
    // At least one preset label is visible inside the dropdown
    const item = await screen.findByText(/later today|tonight|tomorrow morning|next week/i);
    await user.click(item);
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [presetId, fireAt] = onSelect.mock.calls[0]!;
    expect(typeof presetId).toBe('string');
    expect(typeof fireAt).toBe('number');
    expect(fireAt).toBeGreaterThan(Date.now() - 1000);
  });
});
