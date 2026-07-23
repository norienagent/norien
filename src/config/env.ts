import { z } from 'zod';

/**
 * Every tunable value in the system enters through this file. Nothing that a
 * deployment might need to change should be written inline anywhere else.
 */

/**
 * Loads `.env` then `.env.local` into `process.env`.
 *
 * Precedence is explicit: real shell environment > `.env.local` > `.env`. The
 * shell values are captured before loading and re-applied after, so a variable
 * exported in the terminal always wins over a file -- which is what makes CI
 * and one-off overrides behave predictably.
 */
function loadEnvFiles(): void {
  const shellEnv = { ...process.env };

  for (const file of ['.env', '.env.local']) {
    try {
      process.loadEnvFile(file);
    } catch {
      // A missing env file is the normal case, not an error.
    }
  }

  Object.assign(process.env, shellEnv);
}

loadEnvFiles();
/** Treats an empty or whitespace-only value as absent. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  PGLITE_DATA_DIR: z.string().default('./.data/pglite'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  DEFAULT_PAGE_SIZE: z.coerce.number().int().positive().default(20),
  MAX_PAGE_SIZE: z.coerce.number().int().positive().default(100),

  INSTALL_COMMAND_TEMPLATE: z.string().default('norien install {slug}@{version}'),

  /**
   * Seed the sample catalogue when the registry is empty. On by default outside
   * production so a fresh clone is usable straight after `npm run dev`.
   */
  AUTO_SEED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  DEV_PRINCIPAL_HEADER: z.string().default('x-norien-actor'),
  DEV_PRINCIPAL_FALLBACK: z.string().default('anonymous'),

  /**
   * Supabase project URL. When set, a `Authorization: Bearer <jwt>` header is
   * verified against the project's public JWKS and resolves to a real principal.
   * Optional: unset, the registry falls back to header-based identification, so
   * the CLI and existing flows are unaffected.
   */
  SUPABASE_URL: z
    .string()
    .url()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim().replace(/\/+$/, '') : undefined)),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  // -------------------------------------------------------------------------
  // External data providers.
  //
  // Every one is optional at boot: a missing credential disables that provider
  // rather than preventing start-up, so the unified API degrades instead of
  // refusing to run. `/api/providers` reports which are configured.
  // -------------------------------------------------------------------------
  CODEX_API_KEY: optionalString,
  CODEX_GRAPHQL_URL: z.string().url().default('https://graph.codex.io/graphql'),

  GITHUB_TOKEN: optionalString,
  GITHUB_API_URL: z.string().url().default('https://api.github.com'),

  COINGECKO_API_KEY: optionalString,
  COINGECKO_API_URL: z.string().url().default('https://api.coingecko.com/api/v3'),

  DEFILLAMA_API_URL: z.string().url().default('https://api.llama.fi'),

  BLOCKSCOUT_API_URL: optionalString,

  ROBINHOOD_RPC_URL: optionalString,
  ROBINHOOD_CHAIN_ID: z.coerce.number().int().positive().default(4663),
  ROBINHOOD_CHAIN_NAME: z.string().default('Robinhood Chain'),
  ROBINHOOD_NATIVE_CURRENCY: z.string().default('ETH'),
  ROBINHOOD_BLOCK_EXPLORER: optionalString,

  /** Per-request timeout for every outbound provider call, in milliseconds. */
  REQUEST_TIMEOUT: z.coerce.number().int().positive().default(10_000),
  /** Default cache lifetime for provider responses, in seconds. */
  CACHE_TTL: z.coerce.number().int().nonnegative().default(300),
  /** Retry attempts after the first try, for retriable provider failures. */
  PROVIDER_RETRIES: z.coerce.number().int().nonnegative().max(5).default(2),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** True when the process is backed by embedded PGlite rather than a server. */
export const usesEmbeddedDatabase = env.DATABASE_URL === undefined;
