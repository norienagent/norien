import { env } from '../config/env.js';

/**
 * Offset pagination is the current contract. The envelope deliberately carries
 * enough metadata (`has_more`, `next_offset`) that a cursor-based
 * implementation can be swapped in later without changing the response shape
 * clients depend on.
 */

export interface PageRequest {
  limit: number;
  offset: number;
}

export interface PageMeta {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

export function resolvePageRequest(input: {
  limit?: number | undefined;
  offset?: number | undefined;
}): PageRequest {
  const limit = Math.min(input.limit ?? env.DEFAULT_PAGE_SIZE, env.MAX_PAGE_SIZE);
  const offset = Math.max(input.offset ?? 0, 0);
  return { limit, offset };
}

export function buildPage<T>(data: T[], total: number, request: PageRequest): Page<T> {
  const consumed = request.offset + data.length;
  const hasMore = consumed < total;

  return {
    data,
    meta: {
      total,
      limit: request.limit,
      offset: request.offset,
      has_more: hasMore,
      next_offset: hasMore ? consumed : null,
    },
  };
}

/** Maps the items of a page while preserving its metadata. */
export function mapPage<T, R>(page: Page<T>, fn: (item: T) => R): Page<R> {
  return { data: page.data.map(fn), meta: page.meta };
}
