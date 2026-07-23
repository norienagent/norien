import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import {
  createdAt,
  deletedAt,
  primaryId,
  tsvector,
  updatedAt,
  visibilityEnum,
} from './_shared.js';
import { users } from './users.js';

/**
 * How a tool authenticates. Stored as jsonb so new schemes can be added
 * without a migration; the discriminant is validated at the edge.
 */
export interface ToolAuthentication {
  type: 'none' | 'api_key' | 'oauth2' | 'bearer' | 'basic' | 'custom';
  /** Where an api_key is expected, e.g. `header` + `X-Api-Key`. */
  location?: 'header' | 'query' | 'body';
  name?: string;
  scopes?: string[];
  description?: string;
  [key: string]: unknown;
}

/** A JSON Schema document describing a tool's input or output. */
export type JsonSchemaDocument = Record<string, unknown>;

/** Structured declaration of an environment variable a tool needs. */
export interface ToolEnvironmentVariable {
  name: string;
  description?: string;
  required: boolean;
  secret: boolean;
  default?: string;
}

/**
 * A reusable capability an agent can depend on. Tools are versioned on the
 * same model as agents: a mutable head plus immutable version rows.
 */
export const tools = pgTable(
  'tools',
  {
    id: primaryId(),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 500 }).notNull(),

    latestVersion: varchar('latest_version', { length: 64 }).notNull(),
    category: varchar('category', { length: 64 }).notNull().default('other'),

    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    authorHandle: varchar('author_handle', { length: 64 }).notNull(),

    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),

    inputSchema: jsonb('input_schema').$type<JsonSchemaDocument>().notNull(),
    outputSchema: jsonb('output_schema').$type<JsonSchemaDocument>().notNull(),
    authentication: jsonb('authentication')
      .$type<ToolAuthentication>()
      .notNull()
      .default(sql`'{"type":"none"}'::jsonb`),

    /**
     * How the tool is executed. A tool is a plugin the runtime can invoke, so
     * it declares an execution runtime and entrypoint just like an agent does.
     * Nullable because tools published before the marketplace had neither.
     */
    runtime: varchar('runtime', { length: 16 }),
    entrypoint: text('entrypoint'),
    environmentVariables: jsonb('environment_variables')
      .$type<ToolEnvironmentVariable[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Capabilities the tool needs; must be a subset of the calling agent's. */
    permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`),
    /** Other tool slugs this tool depends on. */
    dependencies: text('dependencies').array().notNull().default(sql`'{}'::text[]`),

    license: varchar('license', { length: 64 }),
    homepage: text('homepage'),
    repository: text('repository'),

    documentation: text('documentation'),
    visibility: visibilityEnum('visibility').notNull().default('public'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),

    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
          setweight(to_tsvector('english', coalesce("slug", '')), 'A') ||
          setweight(to_tsvector('english', coalesce("category", '')), 'B') ||
          setweight(to_tsvector('english', coalesce(norien_text_array_to_string("tags"), '')), 'B') ||
          setweight(to_tsvector('english', coalesce("description", '')), 'C')`,
    ),
  },
  (table) => [
    uniqueIndex('tools_slug_unique').on(table.slug),
    index('tools_category_idx').on(table.category),
    index('tools_runtime_idx').on(table.runtime),
    index('tools_visibility_idx').on(table.visibility),
    index('tools_author_idx').on(table.authorId),
    index('tools_created_at_idx').on(table.createdAt),
    index('tools_tags_gin').using('gin', table.tags),
    index('tools_search_gin').using('gin', table.searchVector),
  ],
);

export const toolVersions = pgTable(
  'tool_versions',
  {
    id: primaryId(),
    toolId: uuid('tool_id')
      .notNull()
      .references(() => tools.id, { onDelete: 'cascade' }),

    version: varchar('version', { length: 64 }).notNull(),
    versionSortKey: varchar('version_sort_key', { length: 128 }).notNull(),

    description: varchar('description', { length: 500 }).notNull(),
    inputSchema: jsonb('input_schema').$type<JsonSchemaDocument>().notNull(),
    outputSchema: jsonb('output_schema').$type<JsonSchemaDocument>().notNull(),
    authentication: jsonb('authentication')
      .$type<ToolAuthentication>()
      .notNull()
      .default(sql`'{"type":"none"}'::jsonb`),

    runtime: varchar('runtime', { length: 16 }),
    entrypoint: text('entrypoint'),
    environmentVariables: jsonb('environment_variables')
      .$type<ToolEnvironmentVariable[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`),
    dependencies: text('dependencies').array().notNull().default(sql`'{}'::text[]`),

    license: varchar('license', { length: 64 }),
    homepage: text('homepage'),
    repository: text('repository'),

    documentation: text('documentation'),

    publishedById: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('tool_versions_tool_version_unique').on(table.toolId, table.version),
    index('tool_versions_sort_idx').on(table.toolId, table.versionSortKey),
  ],
);

export type ToolRow = typeof tools.$inferSelect;
export type NewToolRow = typeof tools.$inferInsert;
export type ToolVersionRow = typeof toolVersions.$inferSelect;
export type NewToolVersionRow = typeof toolVersions.$inferInsert;
