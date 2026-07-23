import { buildApp } from './app.js';
import { env, isProduction, isTest } from './config/env.js';
import { closeDb, getDb } from './db/client.js';
import { applyMigrations } from './db/migrate.js';
import { seed } from './db/seed.js';
import { AgentRepository } from './repositories/agent.repository.js';

/**
 * Populates the sample catalogue the first time the server starts against an
 * empty database, so a fresh clone is immediately usable. Never runs in
 * production, and never touches a registry that already has agents in it.
 */
async function seedIfEmpty(log: (line: string) => void): Promise<void> {
  if (!env.AUTO_SEED || isProduction || isTest) return;

  const existing = await new AgentRepository(await getDb()).count();
  if (existing > 0) return;

  log('empty registry detected -- seeding the sample catalogue');
  const report = await seed({ log });
  log(`seeded ${report.tools} tools and ${report.agents} agent versions`);
}

/**
 * Process entrypoint. Migrations run before the port opens so an instance
 * never serves traffic against a stale schema.
 */
async function main(): Promise<void> {
  await applyMigrations();
  await seedIfEmpty((line) => process.stdout.write(`${line}\n`));

  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await closeDb();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => void shutdown(signal));
  }

  await app.listen({ host: env.HOST, port: env.PORT });

  app.log.info(
    `Norien registry listening on ${env.PUBLIC_BASE_URL} -- docs at ${env.PUBLIC_BASE_URL}/docs`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`failed to start: ${String(error)}\n`);
  process.exit(1);
});
