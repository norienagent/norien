import { arrayContains, desc, eq } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import type { PageRequest } from '../core/pagination.js';
import { agents } from '../db/schema/agents.js';
import { tools } from '../db/schema/tools.js';
import type { SearchFilters, SearchHit } from '../services/search/strategy.js';
import {
  alive,
  allOf,
  countExpression,
  textSearchCondition,
  textSearchRank,
  visibleTo,
} from './shared.js';

export type { SearchFilters, SearchHit };

/**
 * Cross-catalogue search.
 *
 * Ranking happens in Postgres via `ts_rank` over the GIN-indexed generated
 * `search_vector` columns, so relevance is computed on the whole corpus rather
 * than on a page of rows pulled into memory.
 */
export class SearchRepository {
  constructor(private readonly db: Executor) {}

  private async searchAgents(
    filters: SearchFilters,
    take: number,
  ): Promise<{ hits: SearchHit[]; total: number }> {
    const conditions: (SQL | undefined)[] = [
      alive(agents.deletedAt),
      visibleTo(agents.visibility, agents.authorId, filters.viewerId),
      textSearchCondition(agents.searchVector, filters.term),
    ];

    if (filters.tags?.length) conditions.push(arrayContains(agents.tags, filters.tags));
    if (filters.author) conditions.push(eq(agents.authorHandle, filters.author));

    const where = allOf(...conditions);
    const rank = textSearchRank(agents.searchVector, filters.term);

    const [rows, totals] = await Promise.all([
      this.db
        .select({ row: agents, score: rank })
        .from(agents)
        .where(where)
        .orderBy(desc(rank), desc(agents.createdAt))
        .limit(take),
      this.db.select({ value: countExpression }).from(agents).where(where),
    ]);

    return {
      hits: rows.map(({ row, score }) => ({ type: 'agent' as const, score, row })),
      total: totals[0]?.value ?? 0,
    };
  }

  private async searchTools(
    filters: SearchFilters,
    take: number,
  ): Promise<{ hits: SearchHit[]; total: number }> {
    const conditions: (SQL | undefined)[] = [
      alive(tools.deletedAt),
      visibleTo(tools.visibility, tools.authorId, filters.viewerId),
      textSearchCondition(tools.searchVector, filters.term),
    ];

    if (filters.tags?.length) conditions.push(arrayContains(tools.tags, filters.tags));
    if (filters.category) conditions.push(eq(tools.category, filters.category));
    if (filters.author) conditions.push(eq(tools.authorHandle, filters.author));

    const where = allOf(...conditions);
    const rank = textSearchRank(tools.searchVector, filters.term);

    const [rows, totals] = await Promise.all([
      this.db
        .select({ row: tools, score: rank })
        .from(tools)
        .where(where)
        .orderBy(desc(rank), desc(tools.createdAt))
        .limit(take),
      this.db.select({ value: countExpression }).from(tools).where(where),
    ]);

    return {
      hits: rows.map(({ row, score }) => ({ type: 'tool' as const, score, row })),
      total: totals[0]?.value ?? 0,
    };
  }

  /**
   * For `type=all`, each side is asked for `offset + limit` rows; merging those
   * and slicing yields exactly the same page a single ranked query would, since
   * no row beyond that depth can surface within the requested window.
   */
  async search(
    filters: SearchFilters,
    page: PageRequest,
  ): Promise<{ hits: SearchHit[]; total: number }> {
    const depth = page.offset + page.limit;

    const [agentResults, toolResults] = await Promise.all([
      filters.type === 'tool'
        ? Promise.resolve({ hits: [] as SearchHit[], total: 0 })
        : this.searchAgents(filters, depth),
      filters.type === 'agent'
        ? Promise.resolve({ hits: [] as SearchHit[], total: 0 })
        : this.searchTools(filters, depth),
    ]);

    const merged = [...agentResults.hits, ...toolResults.hits].sort((a, b) => b.score - a.score);

    return {
      hits: merged.slice(page.offset, page.offset + page.limit),
      total: agentResults.total + toolResults.total,
    };
  }
}
