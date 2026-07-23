/**
 * Domain-level constants. These describe the shape of the registry itself
 * rather than the deployment, so they live in code instead of the environment.
 */

/**
 * Reserved slugs.
 *
 * Slugs only ever appear beneath a collection (`/agents/:slug`, `/tools/:slug`),
 * never at the URL root, so route collision is not the risk. What is reserved
 * here are words that would be genuinely ambiguous in a URL or a CLI argument.
 * Ordinary domain words -- `search`, `wallet`, `twitter`, `install` -- are
 * legitimate tool names and are deliberately *not* reserved.
 */
export const RESERVED_SLUGS: readonly string[] = [
  'health',
  'docs',
  'openapi',
  'api',
  'admin',
  'console',
  'settings',
  'login',
  'logout',
  'signup',
  'me',
  'new',
  'edit',
  'delete',
  'static',
  'assets',
  // Verbs that appear as static path segments under a collection
  // (`/tools/search`, `/tools/publish`, `/tools/install`). Reserving them keeps
  // a slug from ever shadowing an endpoint.
  'search',
  'publish',
  'install',
  'versions',
];

export const SLUG_MIN_LENGTH = 2;
export const SLUG_MAX_LENGTH = 64;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const NAME_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 500;
export const README_MAX_LENGTH = 200_000;

export const MAX_TAGS_PER_AGENT = 20;
export const TAG_MAX_LENGTH = 32;
export const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const MAX_REQUIRED_TOOLS = 50;
export const MAX_PERMISSIONS = 50;
export const MAX_ENVIRONMENT_VARIABLES = 50;

/**
 * Permission vocabulary an agent may request. Kept open-ended with a
 * `namespace:action` convention so new capabilities can be added without a
 * migration, while still rejecting free-form garbage.
 */
export const PERMISSION_PATTERN = /^[a-z][a-z0-9_]*(?::[a-z][a-z0-9_*]*){1,3}$/;

export const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Tool categories.
 *
 * The marketplace's published vocabulary comes first; the legacy values below
 * it are retained so tools published before Phase 5 keep validating. Stored as
 * text, so extending this list never needs a migration.
 */
export const TOOL_CATEGORIES: readonly string[] = [
  // Marketplace categories.
  'search',
  'wallet',
  'blockchain',
  'storage',
  'browser',
  'filesystem',
  'database',
  'notification',
  'discord',
  'telegram',
  'twitter',
  'github',
  'email',
  'http',
  'rpc',
  'ai',
  'utility',
  // Retained for compatibility with earlier tools.
  'data',
  'communication',
  'productivity',
  'developer',
  'finance',
  'media',
  'security',
  'other',
];

/**
 * How a tool is executed. `http` proxies to a remote endpoint; `node` and
 * `python` invoke a local entrypoint over a JSON stdin/stdout protocol.
 */
export const TOOL_RUNTIMES = ['node', 'python', 'http'] as const;
export type ToolRuntimeName = (typeof TOOL_RUNTIMES)[number];

export const MAX_TOOL_DEPENDENCIES = 25;

export const SORTABLE_AGENT_FIELDS = ['created_at', 'updated_at', 'name', 'slug'] as const;
export const SORTABLE_TOOL_FIELDS = ['created_at', 'updated_at', 'name', 'slug'] as const;

export const MANIFEST_FILENAME = 'agent.json';

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

/** Runtimes the platform can describe. Execution itself is a later phase. */
export const RUNTIMES = ['node', 'python'] as const;
export type RuntimeName = (typeof RUNTIMES)[number];

/**
 * Entrypoint extensions the runtime detector understands. Used only when a
 * manifest omits `runtime`, so an older or hand-written agent.json still
 * resolves to something concrete instead of being rejected.
 */
export const RUNTIME_BY_EXTENSION: Readonly<Record<string, RuntimeName>> = {
  '.js': 'node',
  '.mjs': 'node',
  '.cjs': 'node',
  '.ts': 'node',
  '.mts': 'node',
  '.py': 'python',
};

/** Interpreter used to build a default start command per runtime. */
export const RUNTIME_INTERPRETER: Readonly<Record<RuntimeName, string>> = {
  node: 'node',
  python: 'python',
};

/** File a publisher is expected to keep in their repository root. */
export const RUNTIME_MANIFEST_FILES: Readonly<Record<RuntimeName, string>> = {
  node: 'package.json',
  python: 'pyproject.toml',
};

export const COMMAND_MAX_LENGTH = 512;
