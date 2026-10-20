import { defineConfig } from 'vite';

export default defineConfig({
  ssr: { noExternal: ['@acme/domain'] },
  build: {
    ssr: 'src/server.ts',
    target: 'node24',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { entryFileNames: 'server.js' } },
  },
});
