// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { EnergyChip } from './EnergyChip.js';
import { gingermailTheme } from './theme.js';

function renderWithMantine(node: React.ReactNode) {
  return render(<MantineProvider theme={gingermailTheme}>{node}</MantineProvider>);
}

describe('EnergyChip', () => {
  it('renders the correct label for each tag', () => {
    const { rerender } = renderWithMantine(<EnergyChip tag="high" />);
    expect(screen.getByText('Focus')).toBeInTheDocument();

    rerender(
      <MantineProvider theme={gingermailTheme}>
        <EnergyChip tag="medium" />
      </MantineProvider>,
    );
    expect(screen.getByText('Normal')).toBeInTheDocument();

    rerender(
      <MantineProvider theme={gingermailTheme}>
        <EnergyChip tag="low" />
      </MantineProvider>,
    );
    expect(screen.getByText('Skim')).toBeInTheDocument();
  });

  it('renders nothing when tag is undefined', () => {
    const { container } = renderWithMantine(<EnergyChip />);
    expect(container.querySelector('[class*="Badge"]')).toBeNull();
  });
});
