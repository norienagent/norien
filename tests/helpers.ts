import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Each test run gets a throwaway PGlite directory, so suites never inherit
 * state from development data or from each other.
 *
 * These assignments must happen before anything imports `config/env`, which is
 * why this module is loaded via `setupFiles`.
 */
const dataDir = mkdtempSync(path.join(tmpdir(), 'norien-test-'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.PGLITE_DATA_DIR = dataDir;
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_MAX = '100000';

process.on('exit', () => {
  rmSync(dataDir, { recursive: true, force: true });
});
