import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: [path.resolve(__dirname, '../../test/setup.ts')],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
