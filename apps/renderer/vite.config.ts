import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `ANALYZE=1 pnpm --filter @gingermail/renderer analyze` emits dist/stats.html
// (a treemap of the bundle). The plugin is imported lazily so a normal build
// never needs it installed.
const analyze = process.env.ANALYZE === '1';

export default defineConfig(async ({ mode }) => {
  const plugins = [react()];
  if (analyze) {
    const { visualizer } = await import('rollup-plugin-visualizer');
    plugins.push(
      visualizer({
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }) as never,
    );
  }

  return {
    plugins,
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'es2022',
      // Hidden in production: maps are still emitted for local crash analysis
      // but no `//# sourceMappingURL` comment ships, and electron-builder
      // strips *.map from the package anyway. Inline for dev.
      sourcemap: mode === 'production' ? 'hidden' : true,
      rollupOptions: {
        output: {
          // Split rarely-changing vendors into their own long-cacheable chunks
          // and keep the entry/tab chunks lean. Tab code is already split via
          // React.lazy in App.tsx.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@mantine') || id.includes('@emotion')) return 'mantine';
            if (id.includes('@tabler/icons-react')) return 'icons';
            if (
              id.includes('/react-dom/') ||
              id.includes('/react/') ||
              id.includes('/scheduler/')
            ) {
              return 'react';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
