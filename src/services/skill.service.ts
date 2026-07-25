import type { Database } from '../db/client.js';
import { env } from '../config/env.js';
import { AppError } from '../core/errors.js';
import { buildPage, type Page, resolvePageRequest } from '../core/pagination.js';
import { type Principal, requireUser } from '../core/principal.js';
import type { NewSkillRow, SkillDataSource, SkillRow } from '../db/schema/skills.js';
import { SkillRepository } from '../repositories/skill.repository.js';
import { aggregatorService } from './external/aggregator.js';

/** Skill as the API returns it. */
export interface SkillResponse {
  slug: string;
  name: string;
  description: string;
  version: string;
  category: string;
  author: string;
  tags: string[];
  instructions: string;
  data_source: SkillDataSource;
  input_hint: string | null;
  examples: string[];
  updated_at: string;
}

export interface ListSkillsQuery {
  q?: string | undefined;
  category?: string | undefined;
  tag?: string[] | undefined;
  author?: string | undefined;
  sort?: 'created_at' | 'updated_at' | 'name' | 'slug' | undefined;
  order?: 'asc' | 'desc' | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface PublishSkillInput {
  slug: string;
  name: string;
  description: string;
  version?: string;
  category?: string;
  tags?: string[];
  instructions: string;
  data_source?: SkillDataSource;
  input_hint?: string;
  examples?: string[];
}

function serialize(row: SkillRow): SkillResponse {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    version: row.version,
    category: row.category,
    author: row.authorHandle,
    tags: row.tags,
    instructions: row.instructions,
    data_source: row.dataSource,
    input_hint: row.inputHint,
    examples: row.examples,
    updated_at: row.updatedAt.toISOString(),
  };
}

const money = (n: number | null): string => (n === null ? '—' : `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
const pct = (n: number | null): string => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);

/**
 * Skills: the runnable-capability catalogue.
 *
 * A skill couples a plain-language playbook with a Norien data source. Running
 * one resolves that data (a wallet's portfolio, the market list, a token, the
 * registry) and hands it to the model as grounded context — so the output is
 * about real state, not an ungrounded guess.
 */
export class SkillService {
  private readonly repo: SkillRepository;

  constructor(db: Database) {
    this.repo = new SkillRepository(db);
  }

  async list(query: ListSkillsQuery, principal: Principal): Promise<Page<SkillResponse>> {
    const page = resolvePageRequest(query);
    const { rows, total } = await this.repo.list(
      {
        search: query.q,
        category: query.category,
        tags: query.tag,
        author: query.author,
        viewerId: principal.userId,
        sort: query.sort ?? 'created_at',
        order: query.order ?? 'desc',
      },
      page,
    );
    return buildPage(rows.map(serialize), total, page);
  }

  async getBySlug(slug: string): Promise<SkillResponse> {
    const row = await this.repo.findBySlug(slug);
    if (!row) throw AppError.notFound('skill', slug);
    return serialize(row);
  }

  async publish(input: PublishSkillInput, principal: Principal): Promise<SkillResponse> {
    const actor = requireUser(principal);
    const values: NewSkillRow = {
      slug: input.slug,
      name: input.name,
      description: input.description,
      version: input.version ?? '1.0.0',
      category: input.category ?? 'other',
      authorId: actor.userId,
      authorHandle: actor.handle,
      tags: input.tags ?? [],
      instructions: input.instructions,
      dataSource: input.data_source ?? 'none',
      inputHint: input.input_hint ?? null,
      examples: input.examples ?? [],
    };
    return serialize(await this.repo.upsertBySlug(values));
  }

  /** Loads a skill for running, or 404s. */
  async loadForRun(slug: string): Promise<SkillRow> {
    const row = await this.repo.findBySlug(slug);
    if (!row) throw AppError.notFound('skill', slug);
    return row;
  }

  /**
   * Resolves the skill's declared data source against the caller's input and
   * returns a compact text block for the model to reason over. Never throws —
   * a data hiccup degrades to a note rather than failing the run.
   */
  async resolveContext(dataSource: SkillDataSource, input: string): Promise<string> {
    const trimmed = input.trim();
    try {
      if (dataSource === 'markets') {
        // Pin to the native chain — the aggregator returns cross-chain tokens
        // when no chainId is given, which would make a "Robinhood Chain" recap wrong.
        const [gainers, volume] = await Promise.all([
          aggregatorService.listTokens({ ranking: 'change24', limit: 8, chainId: env.ROBINHOOD_CHAIN_ID }),
          aggregatorService.listTokens({ ranking: 'volume24', limit: 8, chainId: env.ROBINHOOD_CHAIN_ID }),
        ]);
        const line = (t: { symbol: string; name: string; price: number | null; change24h: number | null; volume24h: number | null }) =>
          `${t.symbol} (${t.name}) — price ${money(t.price)}, 24h ${pct(t.change24h)}, vol ${money(t.volume24h)}`;
        return [
          'LIVE MARKET DATA (Robinhood Chain):',
          'Top gainers (24h):',
          ...gainers.data.items.map((t) => `- ${line(t)}`),
          'Highest volume (24h):',
          ...volume.data.items.map((t) => `- ${line(t)}`),
        ].join('\n');
      }
      if (dataSource === 'portfolio') {
        if (!trimmed) return 'No wallet address was provided.';
        const p = (await aggregatorService.getPortfolio(trimmed)).data;
        const lines = [
          `WALLET PORTFOLIO for ${trimmed}:`,
          `Net worth: ${money(p.totalUsd)} across ${p.chains.length} chains.`,
          'By chain:',
          ...p.chains.map((c) => `- ${c.label}: ${money(c.usd)}`),
          'Native balances:',
          ...p.native.map((n) => `- ${n.chainLabel}: ${n.balance} ${n.symbol} (${money(n.usd)})`),
        ];
        if (p.tokens.length > 0) {
          lines.push('Tokens:', ...p.tokens.slice(0, 15).map((t) => `- ${t.symbol}: ${t.balance} (${money(t.usd)})`));
        }
        return lines.join('\n');
      }
      if (dataSource === 'token') {
        if (!trimmed) return 'No token address was provided.';
        const t = (await aggregatorService.getToken(trimmed, env.ROBINHOOD_CHAIN_ID)).data;
        if (!t) return `No token found for ${trimmed} on the native chain.`;
        return [
          `TOKEN DATA for ${t.symbol} (${t.name}):`,
          `Price: ${money(t.price)}`,
          `24h change: ${pct(t.change24h)}`,
          `Volume 24h: ${money(t.volume24h)}`,
          `Liquidity: ${money(t.liquidity)}`,
          `Market cap: ${money(t.marketCap)}`,
          `Holders: ${t.holders ?? '—'}`,
          `Chain: ${t.chain.name}`,
        ].join('\n');
      }
      if (dataSource === 'registry') {
        const results = (await aggregatorService.search(trimmed || 'agent', 8)).data;
        return [
          `REGISTRY & MARKET SEARCH for "${trimmed}":`,
          ...results.items.map((r) => `- [${r.kind}] ${r.name}${r.symbol ? ` (${r.symbol})` : ''} — ${r.id}`),
        ].join('\n');
      }
    } catch {
      return '(Live data was briefly unavailable; answer from the request alone.)';
    }
    return '';
  }
}
