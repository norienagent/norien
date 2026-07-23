import { index, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { createdAt, deletedAt, primaryId, updatedAt } from './_shared.js';

/**
 * Publishers and installers.
 *
 * These are created implicitly from the acting handle -- there are no
 * credentials yet. The columns authentication will need (`email`,
 * `password_hash` in a later migration) are intentionally kept off this table
 * so that adding real auth is additive rather than a rewrite.
 */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    handle: varchar('handle', { length: 64 }).notNull(),
    displayName: text('display_name'),
    email: varchar('email', { length: 320 }),
    avatarUrl: text('avatar_url'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('users_handle_unique').on(table.handle),
    uniqueIndex('users_email_unique').on(table.email),
    index('users_created_at_idx').on(table.createdAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
