import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDb, getConnection } from './client.js';

const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

/**
 * Applies pending migrations. Safe to call repeatedly -- drizzle records what
 * has already run in `__drizzle_migrations`.
 */
export async function applyMigrations(): Promise<void> {
  const { runMigrations, driver } = await getConnection();
  await runMigrations(MIGRATIONS_FOLDER);
  process.stdout.write(`migrations applied (${driver})\n`);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  applyMigrations()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      process.stderr.write(`migration failed: ${String(error)}\n`);
      process.exit(1);
    });
}
