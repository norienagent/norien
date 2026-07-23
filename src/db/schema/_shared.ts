
import { customType, pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Visibility applies to agents and tools alike. */
export const visibilityEnum = pgEnum('visibility', ['public', 'private']);

/**
 * Postgres `tsvector`. Drizzle has no first-class type for it, so we declare a
 * custom one; this keeps full-text search in the database rather than in
 * application memory, which is what makes it scale past a few thousand rows.
 */
export const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const primaryId = () => uuid('id').primaryKey().defaultRandom();

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

/**
 * Soft deletion. A registry must never let a slug's history disappear from
 * under consumers that already installed it, so rows are tombstoned rather
 * than removed. Every read path filters on `deleted_at IS NULL`.
 */
export const deletedAt = () =>
  timestamp('deleted_at', { withTimezone: true, mode: 'date' });

/**
 * IMMUTABLE wrapper around `array_to_string`, created in the bootstrap
 * migration. Referenced by the `search_vector` generated columns because the
 * built-in is only STABLE and therefore rejected inside a STORED expression.
 */
export const TEXT_ARRAY_TO_STRING_FN = 'norien_text_array_to_string';
