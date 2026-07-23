import type { Page, PageRequest } from '../../core/pagination.js';
import type { AgentRow } from '../../db/schema/agents.js';
import type { ToolRow } from '../../db/schema/tools.js';

/**
 * The contract every ranking implementation satisfies.
 *
 * Search is defined as an interface rather than a single function because the
 * ranking method is expected to change: today it ranks lexically with Postgres
 * full-text search, and a later phase will rank by embedding similarity. Both
 * answer the same question and return the same shape, so `SearchService`,
 * the route, and the response schema are all indifferent to which is active.
 *
 * A semantic implementation adds an embedding column and a vector index, then
 * registers itself here -- no caller changes.
 */

export interface SearchFilters {
  term: string;
  type: 'all' | 'agent' | 'tool';
  tags?: string[] | undefined;
  category?: string | undefined;
  author?: string | undefined;
  /** Who is asking. Drives private-row visibility. */
  viewerId: string | null;
}

export type SearchHit =
  | { type: 'agent'; score: number; row: AgentRow }
  | { type: 'tool'; score: number; row: ToolRow };

export interface SearchStrategy {
  /** Stable identifier, surfaced so a client can tell how results were ranked. */
  readonly name: string;

  /**
   * Whether this strategy can serve the given query right now. A semantic
   * strategy returns false when embeddings are missing, letting the registry
   * fall back rather than return nothing.
   */
  isAvailable(): Promise<boolean>;

  search(filters: SearchFilters, page: PageRequest): Promise<Page<SearchHit>>;
}

/**
 * Picks the first available strategy in preference order.
 *
 * Ordering is the caller's: put the most capable strategy first and a strategy
 * that is always available last, and the registry degrades instead of failing.
 */
export class SearchStrategyRegistry {
  constructor(private readonly strategies: readonly SearchStrategy[]) {
    if (strategies.length === 0) {
      throw new Error('At least one search strategy must be registered.');
    }
  }

  async resolve(preferred?: string): Promise<SearchStrategy> {
    if (preferred) {
      const match = this.strategies.find((strategy) => strategy.name === preferred);
      if (match && (await match.isAvailable())) return match;
    }

    for (const strategy of this.strategies) {
      if (await strategy.isAvailable()) return strategy;
    }

    // The last strategy is required to be unconditionally available.
    return this.strategies[this.strategies.length - 1] as SearchStrategy;
  }

  get names(): string[] {
    return this.strategies.map((strategy) => strategy.name);
  }
}
