import { type Page, type PageRequest, buildPage } from '../../core/pagination.js';
import type { SearchRepository } from '../../repositories/search.repository.js';
import type { SearchFilters, SearchHit, SearchStrategy } from './strategy.js';

/**
 * Postgres full-text ranking.
 *
 * Scores come from `ts_rank` over the GIN-indexed generated `search_vector`
 * columns, so relevance is computed across the whole corpus rather than over a
 * page pulled into memory. Always available -- it depends only on the schema.
 */
export class LexicalSearchStrategy implements SearchStrategy {
  readonly name = 'lexical';

  constructor(private readonly repository: SearchRepository) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async search(filters: SearchFilters, page: PageRequest): Promise<Page<SearchHit>> {
    const { hits, total } = await this.repository.search(filters, page);
    return buildPage(hits, total, page);
  }
}
