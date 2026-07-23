import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  createdAt,
  deletedAt,
  primaryId,
  tsvector,
  updatedAt,
  visibilityEnum,
} from './_shared.js';
import { tools } from './tools.js';
import { users } from './users.js';

/** Structured declaration of an environment variable an agent needs. */
export interface EnvironmentVariableSpec {
  name: string;
  description?: string;
  required: boolean;
  secret: boolean;
  default?: string;
}

/** Lifecycle commands declared in `agent.json`. */
export interface AgentCommands {
  start?: string;
  health?: string;
  [key: string]: string | undefined;
}

/** The manifest exactly as the publisher supplied it, after normalisation. */
export interface AgentManifest {
  name: string;
  version: string;
  description: string;
  runtime: string;
  entrypoint: string;
  tools: string[];
  permissions: string[];
  environment: EnvironmentVariableSpec[];
  commands: AgentCommands;
  [key: string]: unknown;
}

/**
 * The mutable head of an agent: slug, ownership, and the metadata of whichever
 * version is currently latest. Immutable published payloads live in
 * `agent_versions`.
 */
export const agents = pgTable(
  'agents',
  {
    id: primaryId(),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 500 }).notNull(),

    /** Highest published semver. Denormalised so listings need no join. */
    latestVersion: varchar('latest_version', { length: 64 }).notNull(),

    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    /** Frozen at publish time so listings survive an author rename. */
    authorHandle: varchar('author_handle', { length: 64 }).notNull(),

    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    icon: text('icon'),
    readme: text('readme'),

    permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`),
    requiredTools: text('required_tools').array().notNull().default(sql`'{}'::text[]`),
    environmentVariables: jsonb('environment_variables')
      .$type<EnvironmentVariableSpec[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    entrypoint: text('entrypoint'),
    /**
     * Declared runtime. Nullable because manifests may omit it, in which case
     * the runtime service infers it from the entrypoint at read time.
     */
    runtime: varchar('runtime', { length: 32 }),
    commands: jsonb('commands').$type<AgentCommands>().notNull().default(sql`'{}'::jsonb`),

    /** Null means "derive from the configured template at read time". */
    installCommand: text('install_command'),
    apiEndpoint: text('api_endpoint'),

    visibility: visibilityEnum('visibility').notNull().default('public'),
    manifest: jsonb('manifest').$type<AgentManifest>().notNull(),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),

    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
          setweight(to_tsvector('english', coalesce("slug", '')), 'A') ||
          setweight(to_tsvector('english', coalesce(norien_text_array_to_string("tags"), '')), 'B') ||
          setweight(to_tsvector('english', coalesce("description", '')), 'C')`,
    ),
  },
  (table) => [
    uniqueIndex('agents_slug_unique').on(table.slug),
    index('agents_visibility_idx').on(table.visibility),
    index('agents_author_idx').on(table.authorId),
    index('agents_created_at_idx').on(table.createdAt),
    index('agents_updated_at_idx').on(table.updatedAt),
    index('agents_runtime_idx').on(table.runtime),
    index('agents_tags_gin').using('gin', table.tags),
    index('agents_search_gin').using('gin', table.searchVector),
  ],
);

/**
 * Immutable published versions. Nothing here is ever updated after insert --
 * that is what lets a consumer pin `agent@1.2.3` forever.
 */
export const agentVersions = pgTable(
  'agent_versions',
  {
    id: primaryId(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),

    version: varchar('version', { length: 64 }).notNull(),
    /** Sortable form of the semver, so "10.0.0" > "9.0.0" in SQL. */
    versionSortKey: varchar('version_sort_key', { length: 128 }).notNull(),

    description: varchar('description', { length: 500 }).notNull(),
    readme: text('readme'),
    manifest: jsonb('manifest').$type<AgentManifest>().notNull(),

    permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`),
    requiredTools: text('required_tools').array().notNull().default(sql`'{}'::text[]`),
    environmentVariables: jsonb('environment_variables')
      .$type<EnvironmentVariableSpec[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    entrypoint: text('entrypoint'),
    runtime: varchar('runtime', { length: 32 }),
    commands: jsonb('commands').$type<AgentCommands>().notNull().default(sql`'{}'::jsonb`),
    apiEndpoint: text('api_endpoint'),

    publishedById: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('agent_versions_agent_version_unique').on(table.agentId, table.version),
    index('agent_versions_sort_idx').on(table.agentId, table.versionSortKey),
  ],
);

/**
 * Resolved dependency edges from an agent to the tools it requires.
 *
 * `required_tools` on the agent is the source of truth; this table is the
 * queryable projection of it, which is what makes "show every agent using this
 * tool" a single index scan instead of an array scan.
 */
export const agentToolDependencies = pgTable(
  'agent_tool_dependencies',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    toolSlug: varchar('tool_slug', { length: 64 }).notNull(),
    /** Null when the tool was published after the agent referenced it. */
    toolId: uuid('tool_id').references(() => tools.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.toolSlug] }),
    index('agent_tool_dependencies_tool_idx').on(table.toolSlug),
  ],
);

export type AgentRow = typeof agents.$inferSelect;
export type NewAgentRow = typeof agents.$inferInsert;
export type AgentVersionRow = typeof agentVersions.$inferSelect;
export type NewAgentVersionRow = typeof agentVersions.$inferInsert;
