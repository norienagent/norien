import type { SQL } from 'drizzle-orm';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Predicates every repository needs. Centralising them is what keeps rules
 * like "soft-deleted rows are invisible" from being re-implemented (and
 * eventually forgotten) in each query.
 */

/** Only rows that have not been tombstoned. */
export function alive(deletedAt: PgColumn): SQL {
  return isNull(deletedAt);
}

/**
 * Restricts a listing to what the caller may see: everything public, plus
 * their own private rows. Anonymous callers see only public rows.
 */
export function visibleTo(
  visibility: PgColumn,
  authorId: PgColumn,
  viewerId: string | null,
): SQL {
  const isPublic = eq(visibility, 'public');
  if (!viewerId) return isPublic;
  return or(isPublic, eq(authorId, viewerId)) as SQL;
}

/** Combines predicates, ignoring the undefined ones. */
export function allOf(...conditions: (SQL | undefined)[]): SQL | undefined {
  const present = conditions.filter((condition): condition is SQL => condition !== undefined);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return and(...present);
}

/** Extracts the scalar of a `count(*)` result across both drivers. */
export function toCount(rows: { value: number | string }[]): number {
  const raw = rows[0]?.value ?? 0;
  return typeof raw === 'number' ? raw : Number.parseInt(raw, 10) || 0;
}

export const countExpression = sql<number>`count(*)`.mapWith(Number);

/**
 * Builds a `tsquery` from user input. `websearch_to_tsquery` is used because it
 * never throws on malformed input -- important for a public search box where
 * the query string is arbitrary.
 */
export function textSearchCondition(searchVector: PgColumn, term: string): SQL {
  return sql`${searchVector} @@ websearch_to_tsquery('english', ${term})`;
}

export function textSearchRank(searchVector: PgColumn, term: string): SQL<number> {
  return sql<number>`ts_rank(${searchVector}, websearch_to_tsquery('english', ${term}))`.mapWith(
    Number,
  );
}
