import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/helpers.ts'],
    environment: 'node',
    // PGlite is a single embedded instance per process; running files
    // sequentially keeps them from fighting over the same data directory.
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
