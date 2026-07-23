import { env } from '../../config/env.js';
import { ProviderError, type ProviderClient, providerClient } from '../../core/provider-client.js';
import type { Transaction, TokenTransfer } from './types.js';

/**
 * Blockscout — the Robinhood Chain explorer.
 *
 * The instance exposes two APIs and both are used, deliberately:
 *
 * - **v1** (`/api?module=…`, Etherscan-compatible) for transaction lists, token
 *   transfers, and contract ABIs.
 * - **v2** (`/api/v2/…`) for richer address, contract, and token records that v1
 *   does not expose — verified source, creator, holder counts, icons.
 *
 * Both shapes were confirmed against the live instance.
 */

const ADDRESS_TTL_MS = 60_000;
const CONTRACT_TTL_MS = 600_000;
const LIST_TTL_MS = 30_000;

/** v1 wraps everything in `{ status, message, result }`. */
interface V1Envelope<T> {
  status: string;
  message: string;
  result: T;
}

interface RawV1Tx {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  isError: string;
}

interface RawV1TokenTx {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
}

interface RawV2Address {
  hash: string;
  coin_balance: string | null;
  is_contract: boolean;
  creator_address_hash?: string | null;
  creation_transaction_hash?: string | null;
  block_number_balance_updated_at?: number | null;
}

interface RawV2Contract {
  name?: string | null;
  compiler_version?: string | null;
  optimization_enabled?: boolean | null;
  license_type?: string | null;
  source_code?: string | null;
  abi?: unknown[] | null;
  is_verified?: boolean | null;
}

interface RawV2Token {
  name?: string | null;
  symbol?: string | null;
  decimals?: string | null;
  total_supply?: string | null;
  holders_count?: string | null;
  icon_url?: string | null;
  exchange_rate?: string | null;
}

export interface BlockscoutAddress {
  address: string;
  balance: string;
  isContract: boolean;
  creator: string | null;
  creationTxHash: string | null;
}

export interface BlockscoutContract {
  name: string | null;
  compilerVersion: string | null;
  optimizationEnabled: boolean | null;
  license: string | null;
  sourceCode: string | null;
  abi: unknown[] | null;
  verified: boolean;
}

export interface BlockscoutToken {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
  holders: number | null;
  iconUrl: string | null;
}

function toInt(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Unix seconds to ISO; explorers return seconds, consumers expect ISO. */
function toIso(seconds: string | null | undefined): string | null {
  const parsed = toInt(seconds);
  if (parsed === null) return null;
  return new Date(parsed * 1000).toISOString();
}

export class BlockscoutService {
  readonly name = 'blockscout' as const;

  constructor(private readonly client: ProviderClient = providerClient) {}

  get configured(): boolean {
    return env.BLOCKSCOUT_API_URL !== undefined;
  }

  private get base(): string {
    if (!this.configured) {
      throw new ProviderError('blockscout', 'BLOCKSCOUT_API_URL is not configured.');
    }
    return (env.BLOCKSCOUT_API_URL as string).replace(/\/+$/, '');
  }

  /** `/api` -> `/api/v2`, so one env var configures both surfaces. */
  private get baseV2(): string {
    return this.base.replace(/\/api$/, '/api/v2');
  }

  private async v1<T>(params: Record<string, string>, cacheKey: string, ttl: number): Promise<T | null> {
    const query = new URLSearchParams(params).toString();

    const envelope = await this.client.request<V1Envelope<T>>(
      'blockscout',
      `${this.base}?${query}`,
      { cacheKey, cacheTtlMs: ttl },
    );

    // v1 signals "no records" with status "0" and an explanatory message,
    // which is an empty result rather than a failure.
    if (envelope.status !== '1') return null;
    return envelope.result;
  }

  private v2<T>(path: string, cacheKey: string, ttl: number): Promise<T | null> {
    return this.client.request<T | null>('blockscout', `${this.baseV2}${path}`, {
      cacheKey,
      cacheTtlMs: ttl,
      nullOnStatus: [404],
    });
  }

  async getAddress(address: string): Promise<BlockscoutAddress | null> {
    const key = address.toLowerCase();
    const raw = await this.v2<RawV2Address>(`/addresses/${key}`, `bs:addr:${key}`, ADDRESS_TTL_MS);
    if (!raw) return null;

    return {
      address: raw.hash,
      balance: raw.coin_balance ?? '0',
      isContract: raw.is_contract === true,
      creator: raw.creator_address_hash ?? null,
      creationTxHash: raw.creation_transaction_hash ?? null,
    };
  }

  /** Verified source and ABI. Returns null for an unverified contract. */
  async getContract(address: string): Promise<BlockscoutContract | null> {
    const key = address.toLowerCase();
    const raw = await this.v2<RawV2Contract>(
      `/smart-contracts/${key}`,
      `bs:sc:${key}`,
      CONTRACT_TTL_MS,
    );
    if (!raw) return null;

    const hasSource = typeof raw.source_code === 'string' && raw.source_code.trim() !== '';

    return {
      name: raw.name ?? null,
      compilerVersion: raw.compiler_version ?? null,
      optimizationEnabled: raw.optimization_enabled ?? null,
      license: raw.license_type ?? null,
      sourceCode: hasSource ? (raw.source_code as string) : null,
      abi: Array.isArray(raw.abi) ? raw.abi : null,
      verified: raw.is_verified ?? hasSource,
    };
  }

  async getToken(address: string): Promise<BlockscoutToken | null> {
    const key = address.toLowerCase();
    const raw = await this.v2<RawV2Token>(`/tokens/${key}`, `bs:token:${key}`, CONTRACT_TTL_MS);
    if (!raw) return null;

    return {
      name: raw.name ?? null,
      symbol: raw.symbol ?? null,
      decimals: toInt(raw.decimals),
      totalSupply: raw.total_supply ?? null,
      holders: toInt(raw.holders_count),
      iconUrl: raw.icon_url ?? null,
    };
  }

  /** ABI via v1, which serves it even when v2 has no contract record. */
  async getAbi(address: string): Promise<unknown[] | null> {
    const key = address.toLowerCase();
    const result = await this.v1<string>(
      { module: 'contract', action: 'getabi', address: key },
      `bs:abi:${key}`,
      CONTRACT_TTL_MS,
    );

    if (!result) return null;

    try {
      const parsed: unknown = JSON.parse(result);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async listTransactions(address: string, limit = 10): Promise<Transaction[]> {
    const key = address.toLowerCase();
    const rows = await this.v1<RawV1Tx[]>(
      {
        module: 'account',
        action: 'txlist',
        address: key,
        page: '1',
        offset: String(Math.min(limit, 100)),
        sort: 'desc',
      },
      `bs:txs:${key}:${limit}`,
      LIST_TTL_MS,
    );

    return (rows ?? []).map((raw) => ({
      hash: raw.hash,
      blockNumber: toInt(raw.blockNumber) ?? 0,
      timestamp: toIso(raw.timeStamp),
      from: raw.from,
      to: raw.to === '' ? null : raw.to,
      value: raw.value,
      gasUsed: raw.gasUsed ?? null,
      success: raw.isError === '0',
    }));
  }

  async listTokenTransfers(address: string, limit = 10): Promise<TokenTransfer[]> {
    const key = address.toLowerCase();
    const rows = await this.v1<RawV1TokenTx[]>(
      {
        module: 'account',
        action: 'tokentx',
        address: key,
        page: '1',
        offset: String(Math.min(limit, 100)),
        sort: 'desc',
      },
      `bs:tokentx:${key}:${limit}`,
      LIST_TTL_MS,
    );

    return (rows ?? []).map((raw) => ({
      hash: raw.hash,
      blockNumber: toInt(raw.blockNumber) ?? 0,
      timestamp: toIso(raw.timeStamp),
      from: raw.from,
      to: raw.to,
      value: raw.value,
      tokenAddress: raw.contractAddress,
      tokenSymbol: raw.tokenSymbol ?? null,
      tokenDecimals: toInt(raw.tokenDecimal),
    }));
  }

  /** Liveness probe used by `/api/providers`. */
  async ping(): Promise<boolean> {
    await this.client.request<V1Envelope<string>>(
      'blockscout',
      `${this.base}?module=block&action=eth_block_number`,
      { cacheKey: 'blockscout:ping', cacheTtlMs: 30_000 },
    );
    return true;
  }
}

export const blockscoutService = new BlockscoutService();
