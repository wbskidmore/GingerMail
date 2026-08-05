import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

function resetDom() {
  cleanup();
  // Mantine portals can outlive RTL cleanup under vitest 4, leaving duplicate
  // tabs/search inputs when the next test calls render().
  document.body.replaceChildren();
}

beforeEach(() => {
  resetDom();
});

afterEach(() => {
  resetDom();
});
