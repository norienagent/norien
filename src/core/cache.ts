/**
 * In-memory TTL cache with stale-on-failure fallback.
 *
 * Two behaviours matter for the unified API:
 *
 * - **Fresh hits** avoid hammering rate-limited providers (CoinGecko demo keys
 *   are ~30 req/min; Codex bills per call).
 * - **Stale entries are retained past expiry** so that when a provider fails,
 *   the aggregator can serve the last good value instead of a hole. That is
 *   what makes "if one provider fails, return remaining available data" real
 *   rather than aspirational.
 *
 * Deliberately process-local: this phase runs locally, and a shared cache would
 * be an infrastructure decision, not a code one. `CacheStore` is an interface so
 * a Redis-backed implementation can be substituted without touching callers.
 */

export interface CacheEntry<T> {
  value: T;
  /** When the value stops being fresh. */
  expiresAt: number;
  /** When the value is discarded entirely, even as a fallback. */
  discardAt: number;
  storedAt: number;
}

export interface CacheLookup<T> {
  value: T;
  /** True when the entry is past its TTL but retained for fallback. */
  stale: boolean;
  ageMs: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  staleServed: number;
  sets: number;
  evictions: number;
  size: number;
}

export interface CacheStore {
  get<T>(key: string): CacheLookup<T> | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  delete(key: string): boolean;
  clear(): void;
  readonly stats: CacheStats;
}

export interface TtlCacheOptions {
  /** Default lifetime when `set` is called without one. */
  defaultTtlMs?: number;
  /**
   * How long an expired entry is kept for stale fallback, as a multiple of its
   * TTL. Zero disables stale fallback.
   */
  staleMultiplier?: number;
  /** Hard cap on entries; the oldest are evicted first. */
  maxEntries?: number;
}

const DEFAULT_TTL_MS = 300_000;
const DEFAULT_STALE_MULTIPLIER = 12;
// Entries hold whole provider payloads (token lists, ABIs, transfer histories),
// which run from kilobytes to a megabyte each. On a modest container 5k of those
// is enough to exhaust the heap, so the cap is set for the working set, not the
// theoretical maximum — the hit rate barely moves, the memory ceiling drops a lot.
const DEFAULT_MAX_ENTRIES = 1_500;

export class TtlCache implements CacheStore {
  readonly #entries = new Map<string, CacheEntry<unknown>>();
  readonly #defaultTtlMs: number;
  readonly #staleMultiplier: number;
  readonly #maxEntries: number;

  #hits = 0;
  #misses = 0;
  #staleServed = 0;
  #sets = 0;
  #evictions = 0;

  constructor(options: TtlCacheOptions = {}) {
    this.#defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.#staleMultiplier = options.staleMultiplier ?? DEFAULT_STALE_MULTIPLIER;
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  get<T>(key: string): CacheLookup<T> | undefined {
    const entry = this.#entries.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      this.#misses += 1;
      return undefined;
    }

    const now = Date.now();

    if (now >= entry.discardAt) {
      this.#entries.delete(key);
      this.#misses += 1;
      return undefined;
    }

    const stale = now >= entry.expiresAt;
    if (stale) this.#staleServed += 1;
    else this.#hits += 1;

    return { value: entry.value, stale, ageMs: now - entry.storedAt };
  }

  set<T>(key: string, value: T, ttlMs: number = this.#defaultTtlMs): void {
    const now = Date.now();
    const ttl = Math.max(0, ttlMs);

    this.#entries.set(key, {
      value,
      storedAt: now,
      expiresAt: now + ttl,
      // A zero multiplier means the entry dies exactly at its TTL.
      discardAt: now + ttl + ttl * this.#staleMultiplier,
    });

    this.#sets += 1;
    this.#evictOverflow();
  }

  delete(key: string): boolean {
    return this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }

  get stats(): CacheStats {
    return {
      hits: this.#hits,
      misses: this.#misses,
      staleServed: this.#staleServed,
      sets: this.#sets,
      evictions: this.#evictions,
      size: this.#entries.size,
    };
  }

  /** Map preserves insertion order, so the first key is the oldest write. */
  #evictOverflow(): void {
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) return;
      this.#entries.delete(oldest.value);
      this.#evictions += 1;
    }
  }
}

/** The cache shared by every provider service. */
export const providerCache = new TtlCache();
