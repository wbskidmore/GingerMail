// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AccountBadge } from './AccountBadge.js';
import { gingermailTheme } from './theme.js';

describe('AccountBadge', () => {
  it('renders name + email + initials', () => {
    render(
      <MantineProvider theme={gingermailTheme}>
        <AccountBadge displayName="Will Skidmore" emailAddress="will@example.com" />
      </MantineProvider>,
    );
    expect(screen.getByText('Will Skidmore')).toBeInTheDocument();
    expect(screen.getByText('will@example.com')).toBeInTheDocument();
    expect(screen.getByText('WS')).toBeInTheDocument();
  });

  it('falls back to email initial when displayName is empty', () => {
    render(
      <MantineProvider theme={gingermailTheme}>
        <AccountBadge displayName="" emailAddress="zoe@example.com" />
      </MantineProvider>,
    );
    expect(screen.getByText('Z')).toBeInTheDocument();
  });
});
