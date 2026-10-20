import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    projects: [
      {
        test: {
          name: 'domain',
          include: ['packages/domain/test/**/*.test.ts'],
          environment: 'node',
        },
      },
      { test: { name: 'api', include: ['apps/api/test/**/*.test.ts'], environment: 'node' } },
      {
        test: {
          name: 'web',
          include: ['apps/web/test/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['apps/web/test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/domain/src/**/*.ts',
        'apps/api/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
      ],
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});
