import { type Page, mapPage, resolvePageRequest } from '../core/pagination.js';
import type { Principal } from '../core/principal.js';
import type { Database } from '../db/client.js';
import { createRepositories } from './repositories.js';
import { LexicalSearchStrategy } from './search/lexical.strategy.js';
import { type SearchHit, SearchStrategyRegistry } from './search/strategy.js';
import { serializeAgent, serializeTool } from '../utils/serializers.js';
import type { SearchQuery } from '../validation/search.schema.js';

export type SearchHitResponse =
  | { type: 'agent'; score: number; item: ReturnType<typeof serializeAgent> }
  | { type: 'tool'; score: number; item: ReturnType<typeof serializeTool> };

/**
 * `GET /search` -- one ranked view over both catalogues, so a client does not
 * have to know whether what a user typed is an agent or a tool.
 *
 * Ranking is delegated to a `SearchStrategy`. Only the lexical implementation
 * ships today; a semantic one registers ahead of it without touching this
 * service, the route, or the response contract.
 */
export class SearchService {
  private readonly strategies: SearchStrategyRegistry;

  constructor(private readonly db: Database) {
    const repositories = createRepositories(this.db);

    // Order is preference order. The final entry must always be available so
    // the registry can degrade rather than fail.
    this.strategies = new SearchStrategyRegistry([
      new LexicalSearchStrategy(repositories.search),
    ]);
  }

  /** Ranking implementations currently registered. Surfaced by `GET /health`. */
  get availableStrategies(): string[] {
    return this.strategies.names;
  }

  async search(query: SearchQuery, principal: Principal): Promise<Page<SearchHitResponse>> {
    const page = resolvePageRequest(query);
    const strategy = await this.strategies.resolve(query.strategy);

    const results = await strategy.search(
      {
        term: query.q,
        type: query.type,
        tags: query.tag,
        category: query.category,
        author: query.author,
        viewerId: principal.userId,
      },
      page,
    );

    return mapPage(results, toResponse);
  }
}

function toResponse(hit: SearchHit): SearchHitResponse {
  return hit.type === 'agent'
    ? { type: 'agent', score: hit.score, item: serializeAgent(hit.row) }
    : { type: 'tool', score: hit.score, item: serializeTool(hit.row) };
}
