import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';

import { env, usesEmbeddedDatabase } from '../config/env.js';
import * as schema from './schema/index.js';

/**
 * The application talks to exactly one database type: Postgres.
 *
 * When `DATABASE_URL` is absent we run PGlite, an embedded build of Postgres,
 * so development needs no server. Both drivers execute the same SQL against
 * the same migrations, which is why swapping to a managed Postgres is a
 * configuration change rather than a port.
 */
export type Database = NodePgDatabase<typeof schema>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Anything a repository can run against: the pool or an open transaction. */
export type Executor = Database | Transaction;

interface Connection {
  db: Database;
  driver: 'pglite' | 'node-postgres';
  close: () => Promise<void>;
  /** Drizzle migrator bound to the active driver. */
  runMigrations: (folder: string) => Promise<void>;
}

let connection: Connection | null = null;
let connecting: Promise<Connection> | null = null;

async function createEmbeddedConnection(): Promise<Connection> {
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
    import('drizzle-orm/pglite/migrator'),
  ]);

  const dataDir = path.resolve(process.cwd(), env.PGLITE_DATA_DIR);
  await mkdir(path.dirname(dataDir), { recursive: true });

  const client = new PGlite(dataDir);
  await client.waitReady;

  const db = drizzle(client, { schema, casing: 'snake_case' });

  return {
    db: db as unknown as Database,
    driver: 'pglite',
    close: () => client.close(),
    runMigrations: (folder) => migrate(db, { migrationsFolder: folder }),
  };
}

async function createServerConnection(url: string): Promise<Connection> {
  const [{ default: pg }, { drizzle }, { migrate }] = await Promise.all([
    import('pg'),
    import('drizzle-orm/node-postgres'),
    import('drizzle-orm/node-postgres/migrator'),
  ]);

  const pool = new pg.Pool({ connectionString: url, max: env.DB_POOL_MAX });
  const db = drizzle(pool, { schema, casing: 'snake_case' });

  return {
    db,
    driver: 'node-postgres',
    close: () => pool.end(),
    runMigrations: (folder) => migrate(db, { migrationsFolder: folder }),
  };
}

/** Opens the connection on first use and reuses it thereafter. */
export async function getConnection(): Promise<Connection> {
  if (connection) return connection;

  connecting ??= (usesEmbeddedDatabase
    ? createEmbeddedConnection()
    : createServerConnection(env.DATABASE_URL as string)
  ).then((created) => {
    connection = created;
    connecting = null;
    return created;
  });

  return connecting;
}

export async function getDb(): Promise<Database> {
  return (await getConnection()).db;
}

export async function closeDb(): Promise<void> {
  const active = connection;
  connection = null;
  connecting = null;
  await active?.close();
}

/** Lightweight liveness probe used by `GET /health`. */
export async function pingDatabase(): Promise<{ ok: boolean; driver: string; latencyMs: number }> {
  const started = performance.now();
  const { db, driver } = await getConnection();
  await db.execute(sql`select 1`);
  return { ok: true, driver, latencyMs: Math.round(performance.now() - started) };
}
