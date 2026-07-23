import { defineConfig } from 'drizzle-kit';

/**
 * Migrations are always authored against the Postgres dialect. PGlite speaks
 * the same wire semantics, so a single set of SQL migrations serves both the
 * embedded development database and a managed Postgres in production.
 */
export default defineConfig({
  dialect: 'postgresql',
  casing: 'snake_case',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/norien',
  },
});
