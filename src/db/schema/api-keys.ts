import { index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { createdAt, primaryId } from './_shared.js';

/**
 * Personal API keys.
 *
 * A signed-in user mints these from the web to authenticate the CLI, the SDKs,
 * or their own scripts as themselves — `Authorization: Bearer norien_…`. Only a
 * SHA-256 of the key is stored, never the key itself; the plaintext is shown
 * once at creation and is unrecoverable after. `prefix` keeps a non-secret
 * fragment so a key is identifiable in a list.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: primaryId(),
    /** The owning Norien handle, the same identity a session JWT resolves to. */
    handle: varchar('handle', { length: 64 }).notNull(),
    /** The Supabase user id (JWT `sub`), for traceability. */
    subject: varchar('subject', { length: 64 }),
    name: varchar('name', { length: 80 }).notNull(),
    /** A non-secret leading fragment, e.g. `norien_ab12cd`, shown in listings. */
    prefix: varchar('prefix', { length: 24 }).notNull(),
    /** SHA-256 hex of the full key. The key itself is never stored. */
    keyHash: varchar('key_hash', { length: 64 }).notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('api_keys_key_hash_unique').on(table.keyHash),
    index('api_keys_handle_idx').on(table.handle),
  ],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
