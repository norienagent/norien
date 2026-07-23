import { env } from '../config/env.js';
import { type CacheStore, providerCache } from './cache.js';

/**
 * The single outbound path to every external provider.
 *
 * Timeout, retry, caching, structured logging, and error normalisation are
 * implemented exactly once, here. Provider services describe *what* to fetch;
 * this describes *how* every fetch behaves. Nothing else in the codebase calls
 * `fetch` against a third party.
 */

export type ProviderName = 'codex' | 'github' | 'coingecko' | 'defillama' | 'blockscout' | 'rpc';

/** A provider call that failed in a way the caller can reason about. */
export class ProviderError extends Error {
  readonly provider: ProviderName;
  readonly status: number | null;
  readonly retriable: boolean;
  readonly attempts: number;
  override readonly cause?: unknown;

  constructor(
    provider: ProviderName,
    message: string,
    options: {
      status?: number | null;
      retriable?: boolean;
      attempts?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = options.status ?? null;
    this.retriable = options.retriable ?? false;
    this.attempts = options.attempts ?? 1;
    this.cause = options.cause;
  }

  /** True when the provider was unreachable rather than returning an error. */
  get isNetworkError(): boolean {
    return this.status === null;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

// --- Structured logging ----------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ProviderLogRecord {
  level: LogLevel;
  event: string;
  provider: ProviderName;
  [key: string]: unknown;
}

export type ProviderLogger = (record: ProviderLogRecord) => void;

/**
 * Emits one JSON object per line on stderr, so provider traffic is greppable
 * and never contaminates an API response on stdout. Silent in tests.
 */
const defaultLogger: ProviderLogger = (record) => {
  if (env.NODE_ENV === 'test' || env.LOG_LEVEL === 'silent') return;
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`);
};

let activeLogger: ProviderLogger = defaultLogger;

export function setProviderLogger(logger: ProviderLogger): void {
  activeLogger = logger;
}

export function resetProviderLogger(): void {
  activeLogger = defaultLogger;
}

// --- Request ---------------------------------------------------------------

/** Statuses worth retrying: transient server and rate-limit conditions. */
const RETRIABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface ProviderRequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** Serialised as JSON when present; forces POST semantics. */
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  /**
   * Cache key. Omit to bypass the cache entirely (writes, or calls whose
   * freshness matters more than provider load).
   */
  cacheKey?: string;
  cacheTtlMs?: number;
  /** Treat these statuses as `null` rather than an error, e.g. 404 lookups. */
  nullOnStatus?: number[];
  signal?: AbortSignal;
}

export interface ProviderClientOptions {
  cache?: CacheStore;
}

function backoffMs(attempt: number): number {
  // 200ms, 400ms, 800ms... with jitter so parallel calls do not resonate.
  return 200 * 2 ** attempt + Math.floor(Math.random() * 100);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strips query strings so keys and secrets never reach the logs. */
function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export class ProviderClient {
  readonly #cache: CacheStore;

  constructor(options: ProviderClientOptions = {}) {
    this.#cache = options.cache ?? providerCache;
  }

  get cache(): CacheStore {
    return this.#cache;
  }

  /**
   * Performs a request and returns parsed JSON.
   *
   * On failure, a still-retained stale cache entry is served instead of
   * throwing -- the graceful-fallback guarantee. Only when there is nothing
   * cached does the error surface.
   */
  async request<T>(
    provider: ProviderName,
    url: string,
    options: ProviderRequestOptions = {},
  ): Promise<T> {
    const {
      method = options.body === undefined ? 'GET' : 'POST',
      headers = {},
      body,
      timeoutMs = env.REQUEST_TIMEOUT,
      retries = env.PROVIDER_RETRIES,
      cacheKey,
      cacheTtlMs = env.CACHE_TTL * 1000,
      nullOnStatus = [],
    } = options;

    if (cacheKey) {
      const cached = this.#cache.get<T>(cacheKey);
      if (cached && !cached.stale) {
        activeLogger({
          level: 'debug',
          event: 'provider.cache.hit',
          provider,
          url: safeUrl(url),
          ageMs: cached.ageMs,
        });
        return cached.value;
      }
    }

    const startedAt = Date.now();
    let lastError: ProviderError | undefined;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      // An external abort signal must also cancel the in-flight request.
      const onExternalAbort = () => controller.abort();
      options.signal?.addEventListener('abort', onExternalAbort, { once: true });

      try {
        const response = await fetch(url, {
          method,
          headers: {
            accept: 'application/json',
            'user-agent': 'norien/0.1',
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...headers,
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        });

        if (nullOnStatus.includes(response.status)) {
          activeLogger({
            level: 'debug',
            event: 'provider.request.absent',
            provider,
            url: safeUrl(url),
            status: response.status,
            ms: Date.now() - startedAt,
          });
          return null as T;
        }

        if (!response.ok) {
          const retriable = RETRIABLE_STATUS.has(response.status);
          const text = await response.text().catch(() => '');

          lastError = new ProviderError(
            provider,
            `${provider} responded ${response.status}: ${text.slice(0, 200) || response.statusText}`,
            { status: response.status, retriable, attempts: attempt + 1 },
          );

          if (retriable && attempt < retries) {
            activeLogger({
              level: 'warn',
              event: 'provider.request.retry',
              provider,
              url: safeUrl(url),
              status: response.status,
              attempt: attempt + 1,
            });
            await sleep(backoffMs(attempt));
            continue;
          }

          throw lastError;
        }

        const parsed = (await response.json()) as T;

        if (cacheKey) this.#cache.set(cacheKey, parsed, cacheTtlMs);

        activeLogger({
          level: 'info',
          event: 'provider.request.ok',
          provider,
          url: safeUrl(url),
          status: response.status,
          ms: Date.now() - startedAt,
          attempts: attempt + 1,
          cached: false,
        });

        return parsed;
      } catch (error) {
        if (error instanceof ProviderError) {
          lastError = error;
        } else {
          const aborted = controller.signal.aborted;
          lastError = new ProviderError(
            provider,
            aborted
              ? `${provider} timed out after ${timeoutMs}ms`
              : `${provider} request failed: ${error instanceof Error ? error.message : String(error)}`,
            { status: null, retriable: true, attempts: attempt + 1, cause: error },
          );
        }

        const canRetry = lastError.retriable && attempt < retries;
        if (canRetry) {
          activeLogger({
            level: 'warn',
            event: 'provider.request.retry',
            provider,
            url: safeUrl(url),
            reason: lastError.message,
            attempt: attempt + 1,
          });
          await sleep(backoffMs(attempt));
          continue;
        }

        break;
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onExternalAbort);
      }
    }

    const failure =
      lastError ?? new ProviderError(provider, `${provider} request failed`, { attempts: 1 });

    // Graceful fallback: a retained stale value beats an error.
    if (cacheKey) {
      const stale = this.#cache.get<T>(cacheKey);
      if (stale) {
        activeLogger({
          level: 'warn',
          event: 'provider.cache.stale_fallback',
          provider,
          url: safeUrl(url),
          ageMs: stale.ageMs,
          reason: failure.message,
        });
        return stale.value;
      }
    }

    activeLogger({
      level: 'error',
      event: 'provider.request.failed',
      provider,
      url: safeUrl(url),
      status: failure.status,
      attempts: failure.attempts,
      ms: Date.now() - startedAt,
      reason: failure.message,
    });

    throw failure;
  }
}

/** The client every provider service shares. */
export const providerClient = new ProviderClient();
