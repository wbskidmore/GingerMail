// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../App.js';

/**
 * Search bar relocation regression: the global search input must NOT live
 * inside the (draggable) title bar any more — it lives in its own ActionBar
 * row below it. This test asserts the input is reachable and that nothing
 * inside the title bar still has the search aria-label.
 */
describe('Nav search relocation', () => {
  it('renders the search input outside of the title-bar drag region', async () => {
    render(<App />);
    const search = await screen.findByRole('textbox', { name: /search gingermail/i });
    expect(search).toBeInTheDocument();
    // Walk up the DOM and confirm we never pass through .gm-titlebar-region.
    let el: HTMLElement | null = search;
    while (el) {
      expect(el.classList?.contains('gm-titlebar-region')).toBe(false);
      el = el.parentElement;
    }
  });

  it('places the search input inside the .gm-actionbar-region row', async () => {
    render(<App />);
    const search = await screen.findByRole('textbox', { name: /search gingermail/i });
    let el: HTMLElement | null = search;
    let foundActionBar = false;
    while (el) {
      if (el.classList?.contains('gm-actionbar-region')) {
        foundActionBar = true;
        break;
      }
      el = el.parentElement;
    }
    expect(foundActionBar).toBe(true);
  });
});
