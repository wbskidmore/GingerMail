import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

/**
 * Global test setup. Loaded by every package's vitest run.
 *
 * - matchMedia / ResizeObserver are required by Mantine (jsdom only).
 * - DOM cleanup for jsdom lives in test/setup-dom.ts (renderer + ui-kit).
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

afterEach(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.className = '';
    delete document.documentElement.dataset['theme'];
    delete document.documentElement.dataset['density'];
    delete document.documentElement.dataset['font'];
  }
  vi.restoreAllMocks();
});
