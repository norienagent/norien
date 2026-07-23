import { env } from '../../config/env.js';
import { ProviderError, type ProviderClient, providerClient } from '../../core/provider-client.js';

/**
 * Robinhood Chain JSON-RPC — direct node access.
 *
 * Block height, balances, contract reads, event logs, gas, and batched
 * multicall. This is the ground truth the explorer is derived from, so it is
 * used to confirm or fill gaps in Blockscout data rather than duplicate it.
 *
 * Deliberately dependency-free: JSON-RPC is a small protocol, and adding an
 * Ethereum client library for six methods would be disproportionate.
 */

/** ERC-20 selectors used by `readToken`. */
const SELECTOR = {
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
} as const;

interface RpcResponse<T> {
  jsonrpc: string;
  id: number | string;
  result?: T;
  error?: { code: number; message: string };
}

export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export interface TokenReads {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
}

/** Decodes a hex-encoded ABI string return value. */
function decodeAbiString(hex: string): string | null {
  if (!hex || hex === '0x') return null;

  const body = hex.slice(2);

  // Dynamic string: offset (32B), length (32B), then padded UTF-8 bytes.
  if (body.length >= 128) {
    const length = Number.parseInt(body.slice(64, 128), 16);
    if (Number.isFinite(length) && length > 0 && body.length >= 128 + length * 2) {
      const bytes = Buffer.from(body.slice(128, 128 + length * 2), 'hex');
      const text = bytes.toString('utf8').replace(/\0+$/, '');
      if (text.trim() !== '') return text;
    }
  }

  // Some older tokens return a fixed bytes32 instead.
  const trimmed = Buffer.from(body, 'hex').toString('utf8').replace(/\0+/g, '').trim();
  return trimmed === '' ? null : trimmed;
}

function hexToNumber(hex: string | null | undefined): number | null {
  if (!hex) return null;
  const parsed = Number.parseInt(hex, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function hexToBigIntString(hex: string | null | undefined): string | null {
  if (!hex || hex === '0x') return null;
  try {
    return BigInt(hex).toString();
  } catch {
    return null;
  }
}

/** Wei to a decimal string, without floating-point loss. */
export function formatUnits(value: string, decimals: number): string {
  const negative = value.startsWith('-');
  const digits = (negative ? value.slice(1) : value).padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');

  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export class RpcService {
  readonly name = 'rpc' as const;
  #nextId = 1;

  constructor(private readonly client: ProviderClient = providerClient) {}

  get configured(): boolean {
    return env.ROBINHOOD_RPC_URL !== undefined;
  }

  get chainId(): number {
    return env.ROBINHOOD_CHAIN_ID;
  }

  get chainName(): string {
    return env.ROBINHOOD_CHAIN_NAME;
  }

  private get url(): string {
    if (!this.configured) {
      throw new ProviderError('rpc', 'ROBINHOOD_RPC_URL is not configured.');
    }
    return env.ROBINHOOD_RPC_URL as string;
  }

  /** A single JSON-RPC call. */
  async call<T>(
    method: string,
    params: unknown[] = [],
    options: { cacheKey?: string; cacheTtlMs?: number } = {},
  ): Promise<T> {
    const response = await this.client.request<RpcResponse<T>>('rpc', this.url, {
      method: 'POST',
      body: { jsonrpc: '2.0', id: this.#nextId++, method, params },
      ...(options.cacheKey ? { cacheKey: options.cacheKey } : {}),
      ...(options.cacheTtlMs !== undefined ? { cacheTtlMs: options.cacheTtlMs } : {}),
    });

    if (response.error) {
      throw new ProviderError('rpc', `${method} failed: ${response.error.message}`, {
        status: 200,
      });
    }

    return response.result as T;
  }

  /**
   * Batched calls in one HTTP round trip — the multicall primitive.
   *
   * Individual entries may fail without failing the batch, so results are
   * returned per-request with their own error.
   */
  async batch<T>(
    requests: { method: string; params?: unknown[] }[],
  ): Promise<{ result: T | null; error: string | null }[]> {
    if (requests.length === 0) return [];

    const payload = requests.map((request, index) => ({
      jsonrpc: '2.0',
      id: index,
      method: request.method,
      params: request.params ?? [],
    }));

    const responses = await this.client.request<RpcResponse<T>[]>('rpc', this.url, {
      method: 'POST',
      body: payload,
    });

    // A batch response may arrive out of order, so results are re-keyed by id.
    const byId = new Map<number, RpcResponse<T>>();
    for (const response of responses) byId.set(Number(response.id), response);

    return requests.map((_, index) => {
      const response = byId.get(index);
      if (!response) return { result: null, error: 'no response for request' };
      if (response.error) return { result: null, error: response.error.message };
      return { result: response.result ?? null, error: null };
    });
  }

  async getBlockNumber(): Promise<number> {
    const hex = await this.call<string>('eth_blockNumber', [], {
      cacheKey: 'rpc:blockNumber',
      cacheTtlMs: 5_000,
    });
    return hexToNumber(hex) ?? 0;
  }

  async getGasPrice(): Promise<string> {
    const hex = await this.call<string>('eth_gasPrice', [], {
      cacheKey: 'rpc:gasPrice',
      cacheTtlMs: 10_000,
    });
    return hexToBigIntString(hex) ?? '0';
  }

  async getBalance(address: string): Promise<string> {
    const hex = await this.call<string>('eth_getBalance', [address, 'latest']);
    return hexToBigIntString(hex) ?? '0';
  }

  async getTransactionCount(address: string): Promise<number> {
    const hex = await this.call<string>('eth_getTransactionCount', [address, 'latest']);
    return hexToNumber(hex) ?? 0;
  }

  /** Bytecode size in bytes; 0 means an externally owned account. */
  async getCodeSize(address: string): Promise<number> {
    const code = await this.call<string>('eth_getCode', [address, 'latest'], {
      cacheKey: `rpc:code:${address.toLowerCase()}`,
      cacheTtlMs: 600_000,
    });
    if (!code || code === '0x') return 0;
    return Math.floor((code.length - 2) / 2);
  }

  /** Raw contract read. */
  async readContract(to: string, data: string): Promise<string> {
    return this.call<string>('eth_call', [{ to, data }, 'latest']);
  }

  async estimateGas(params: { to: string; from?: string; data?: string; value?: string }): Promise<string> {
    const hex = await this.call<string>('eth_estimateGas', [params]);
    return hexToBigIntString(hex) ?? '0';
  }

  async getLogs(filter: {
    address?: string;
    fromBlock?: string;
    toBlock?: string;
    topics?: (string | null)[];
  }): Promise<RpcLog[]> {
    const raw = await this.call<
      { address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string }[]
    >('eth_getLogs', [
      {
        fromBlock: filter.fromBlock ?? 'latest',
        toBlock: filter.toBlock ?? 'latest',
        ...(filter.address ? { address: filter.address } : {}),
        ...(filter.topics ? { topics: filter.topics } : {}),
      },
    ]);

    return (raw ?? []).map((log) => ({
      address: log.address,
      topics: log.topics,
      data: log.data,
      blockNumber: hexToNumber(log.blockNumber) ?? 0,
      transactionHash: log.transactionHash,
      logIndex: hexToNumber(log.logIndex) ?? 0,
    }));
  }

  /**
   * ERC-20 identity read in one batched round trip. Any individual call may
   * fail (a non-token contract), which yields null for that field rather than
   * failing the whole read.
   */
  async readToken(address: string): Promise<TokenReads> {
    const results = await this.batch<string>([
      { method: 'eth_call', params: [{ to: address, data: SELECTOR.name }, 'latest'] },
      { method: 'eth_call', params: [{ to: address, data: SELECTOR.symbol }, 'latest'] },
      { method: 'eth_call', params: [{ to: address, data: SELECTOR.decimals }, 'latest'] },
      { method: 'eth_call', params: [{ to: address, data: SELECTOR.totalSupply }, 'latest'] },
    ]);

    const [name, symbol, decimals, totalSupply] = results;

    return {
      name: name?.result ? decodeAbiString(name.result) : null,
      symbol: symbol?.result ? decodeAbiString(symbol.result) : null,
      decimals: decimals?.result ? hexToNumber(decimals.result) : null,
      totalSupply: totalSupply?.result ? hexToBigIntString(totalSupply.result) : null,
    };
  }

  /** Liveness probe used by `/api/providers`. */
  async ping(): Promise<boolean> {
    await this.getBlockNumber();
    return true;
  }
}

export const rpcService = new RpcService();
