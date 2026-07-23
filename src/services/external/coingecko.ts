import { env } from '../../config/env.js';
import { type ProviderClient, providerClient } from '../../core/provider-client.js';

/**
 * CoinGecko — metadata only.
 *
 * Logo, description, categories, and supply figures. **Never a price source**:
 * Codex is authoritative for market data, and mixing the two would produce
 * responses whose numbers disagree with each other.
 *
 * The configured key is a Demo key (`CG-` prefix), which pairs with the public
 * base URL and the `x-cg-demo-api-key` header. Demo keys are rate-limited to a
 * few dozen calls a minute, so every read here is cached.
 */

export interface CoinGeckoMetadata {
  id: string;
  symbol: string;
  name: string;
  logo: string | null;
  description: string | null;
  categories: string[];
  homepage: string | null;
  twitter: string | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
}

export interface CoinGeckoSearchHit {
  id: string;
  name: string;
  symbol: string;
  logo: string | null;
  marketCapRank: number | null;
}

interface RawCoin {
  id: string;
  symbol: string;
  name: string;
  description?: { en?: string };
  categories?: (string | null)[];
  image?: { thumb?: string; small?: string; large?: string };
  links?: { homepage?: string[]; twitter_screen_name?: string | null };
  market_data?: {
    circulating_supply?: number | null;
    total_supply?: number | null;
    max_supply?: number | null;
  };
}

interface RawSearch {
  coins?: { id: string; name: string; symbol: string; large?: string; thumb?: string; market_cap_rank?: number | null }[];
}

/** Long TTL: none of this metadata changes minute to minute. */
const METADATA_TTL_MS = 3_600_000;
const SEARCH_TTL_MS = 600_000;

function firstNonEmpty(values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

function normalizeCoin(raw: RawCoin): CoinGeckoMetadata {
  const description = raw.description?.en?.trim();

  return {
    id: raw.id,
    symbol: raw.symbol?.toUpperCase() ?? '',
    name: raw.name,
    logo: firstNonEmpty([raw.image?.large, raw.image?.small, raw.image?.thumb]),
    description: description && description !== '' ? description : null,
    categories: (raw.categories ?? []).filter((c): c is string => typeof c === 'string' && c !== ''),
    homepage: firstNonEmpty(raw.links?.homepage ?? []),
    twitter: raw.links?.twitter_screen_name
      ? `https://twitter.com/${raw.links.twitter_screen_name}`
      : null,
    circulatingSupply: raw.market_data?.circulating_supply ?? null,
    totalSupply: raw.market_data?.total_supply ?? null,
    maxSupply: raw.market_data?.max_supply ?? null,
  };
}

export class CoinGeckoService {
  readonly name = 'coingecko' as const;

  constructor(private readonly client: ProviderClient = providerClient) {}

  get configured(): boolean {
    return env.COINGECKO_API_KEY !== undefined;
  }

  private headers(): Record<string, string> {
    return this.configured ? { 'x-cg-demo-api-key': env.COINGECKO_API_KEY as string } : {};
  }

  /** Metadata by CoinGecko coin id, e.g. `ethereum`. */
  async getCoin(id: string): Promise<CoinGeckoMetadata | null> {
    const url =
      `${env.COINGECKO_API_URL}/coins/${encodeURIComponent(id)}` +
      `?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;

    const raw = await this.client.request<RawCoin | null>('coingecko', url, {
      headers: this.headers(),
      cacheKey: `coingecko:coin:${id}`,
      cacheTtlMs: METADATA_TTL_MS,
      nullOnStatus: [404],
    });

    return raw ? normalizeCoin(raw) : null;
  }

  /**
   * Metadata for a token by its contract address on a given asset platform
   * (CoinGecko's own chain identifier, e.g. `ethereum`, `base`).
   */
  async getByContract(platform: string, address: string): Promise<CoinGeckoMetadata | null> {
    const url = `${env.COINGECKO_API_URL}/coins/${encodeURIComponent(platform)}/contract/${encodeURIComponent(address.toLowerCase())}`;

    const raw = await this.client.request<RawCoin | null>('coingecko', url, {
      headers: this.headers(),
      cacheKey: `coingecko:contract:${platform}:${address.toLowerCase()}`,
      cacheTtlMs: METADATA_TTL_MS,
      nullOnStatus: [404],
    });

    return raw ? normalizeCoin(raw) : null;
  }

  /** Free-text coin search; used to enrich search results with logos. */
  async search(query: string, limit = 10): Promise<CoinGeckoSearchHit[]> {
    const url = `${env.COINGECKO_API_URL}/search?query=${encodeURIComponent(query)}`;

    const raw = await this.client.request<RawSearch>('coingecko', url, {
      headers: this.headers(),
      cacheKey: `coingecko:search:${query.toLowerCase()}`,
      cacheTtlMs: SEARCH_TTL_MS,
    });

    return (raw.coins ?? []).slice(0, limit).map((coin) => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol?.toUpperCase() ?? '',
      logo: firstNonEmpty([coin.large, coin.thumb]),
      marketCapRank: coin.market_cap_rank ?? null,
    }));
  }

  /** Liveness probe used by `/api/providers`. */
  async ping(): Promise<boolean> {
    await this.client.request<{ gecko_says?: string }>(
      'coingecko',
      `${env.COINGECKO_API_URL}/ping`,
      { headers: this.headers(), cacheKey: 'coingecko:ping', cacheTtlMs: 60_000 },
    );
    return true;
  }
}

export const coinGeckoService = new CoinGeckoService();
