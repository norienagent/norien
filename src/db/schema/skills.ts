import { sql } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { createdAt, deletedAt, primaryId, tsvector, updatedAt, visibilityEnum } from './_shared.js';
import { users } from './users.js';

/**
 * Which Norien data a skill is grounded in. Before the model runs, the backend
 * resolves this — a wallet's portfolio, the market list, one token, or the
 * registry — and feeds it in as context. `none` is a pure instruction skill.
 * A closed enum (not arbitrary code) keeps user-published skills safe to run.
 */
export const skillDataSourceEnum = pgEnum('skill_data_source', [
  'none',
  'markets',
  'portfolio',
  'token',
  'registry',
]);

/**
 * A Skill: a published, runnable capability. It pairs a plain-language playbook
 * (`instructions`) with a Norien data source, so anyone can run it against
 * their own input and get a grounded, LLM-written result. Lighter than a tool —
 * no execution runtime, no immutable version history yet — because a skill is
 * "what to do with the data", not a piece of code to invoke.
 */
export const skills = pgTable(
  'skills',
  {
    id: primaryId(),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 500 }).notNull(),
    version: varchar('version', { length: 64 }).notNull().default('1.0.0'),
    category: varchar('category', { length: 64 }).notNull().default('other'),

    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    authorHandle: varchar('author_handle', { length: 64 }).notNull(),

    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),

    /** The playbook the model follows — the heart of the skill. */
    instructions: text('instructions').notNull(),
    /** Which live Norien data to resolve and feed in as context before running. */
    dataSource: skillDataSourceEnum('data_source').notNull().default('none'),
    /** A short hint for what to type when running (e.g. "a wallet address"). */
    inputHint: varchar('input_hint', { length: 200 }),
    /** Example inputs, surfaced as one-tap suggestions. */
    examples: jsonb('examples').$type<string[]>().notNull().default(sql`'[]'::jsonb`),

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
    uniqueIndex('skills_slug_unique').on(table.slug),
    index('skills_category_idx').on(table.category),
    index('skills_visibility_idx').on(table.visibility),
    index('skills_author_idx').on(table.authorId),
    index('skills_created_at_idx').on(table.createdAt),
    index('skills_tags_gin').using('gin', table.tags),
    index('skills_search_gin').using('gin', table.searchVector),
  ],
);

export type SkillRow = typeof skills.$inferSelect;
export type NewSkillRow = typeof skills.$inferInsert;
export type SkillDataSource = (typeof skillDataSourceEnum.enumValues)[number];
