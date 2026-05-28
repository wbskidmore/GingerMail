import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

/**
 * Global test setup. Loaded by every package's vitest run.
 *
 * - matchMedia / ResizeObserver are required by Mantine (jsdom only).
 * - We lazy-require @testing-library/react inside the afterEach so this file
 *   stays usable in pure-Node test environments (packages/core, providers).
 */

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  }
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof window.scrollTo !== 'function') {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  }
}

afterEach(async () => {
  if (typeof document !== 'undefined') {
    try {
      const { cleanup } = await import('@testing-library/react');
      cleanup();
    } catch {
      // @testing-library/react isn't installed in this package - that's fine.
    }
    document.documentElement.className = '';
    delete document.documentElement.dataset['theme'];
    delete document.documentElement.dataset['density'];
    delete document.documentElement.dataset['font'];
  }
  vi.restoreAllMocks();
});
