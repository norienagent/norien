import axios, { type AxiosInstance } from 'axios';

import { toNorienError } from './errors.js';

export interface NorienClientOptions {
  /**
   * API key. Sent as `Authorization: Bearer <key>`.
   *
   * The registry declares this scheme but does not enforce it yet, so a key is
   * optional today. Sending it now means no client change is needed when the
   * registry starts verifying keys.
   */
  apiKey?: string;
  /** Registry base URL. Defaults to `NORIEN_REGISTRY` or localhost. */
  baseUrl?: string;
  /**
   * Acting handle, sent as `x-norien-actor`. This is what the registry
   * currently uses to attribute publishes and installs.
   */
  actor?: string;
  timeout?: number;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  /** Retry attempts for transient failures. Defaults to 2. */
  retries?: number;
  userAgent?: string;
}

/**
 * The hosted registry, used when nothing else supplies a URL.
 *
 * Resolution order: `--registry` → `NORIEN_REGISTRY` → the stored profile →
 * this. So installing the CLI and running a command "just works" against the
 * public registry, while any of the three overrides points it elsewhere —
 * `NORIEN_REGISTRY=http://localhost:3000` for local development, for instance.
 */
export const DEFAULT_BASE_URL = 'https://api.norien.live';
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_RETRIES = 2;
const ACTOR_HEADER = 'x-norien-actor';

/** Retried only where a retry is safe and plausibly helpful. */
const RETRYABLE_STATUS = new Set([408, 429, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['get', 'head', 'options']);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Any plain object of query parameters. Deliberately structural rather than an
 * index signature, so typed parameter interfaces pass without a cast at every
 * call site.
 */
export type QueryParams = object;

/**
 * Serialises query parameters the way the registry expects: arrays are
 * repeated (`?tag=a&tag=b`) and undefined values are dropped entirely.
 */
export function toQuery(params: QueryParams | undefined): URLSearchParams {
  const query = new URLSearchParams();
  if (!params) return query;

  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry !== undefined && entry !== null && entry !== '') query.append(key, String(entry));
      }
      continue;
    }

    query.append(key, String(value));
  }

  return query;
}

/**
 * The transport every resource shares.
 *
 * Kept separate from the client so that auth, retries, and error normalisation
 * are defined exactly once, and each resource stays a thin mapping onto routes.
 */
export class HttpTransport {
  readonly baseUrl: string;
  readonly actor: string | undefined;
  private readonly axios: AxiosInstance;
  private readonly retries: number;

  constructor(options: NorienClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.NORIEN_REGISTRY ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      '',
    );
    this.actor = options.actor ?? process.env.NORIEN_ACTOR;
    this.retries = options.retries ?? DEFAULT_RETRIES;

    const apiKey = options.apiKey ?? process.env.NORIEN_API_KEY;

    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': options.userAgent ?? '@norien/sdk',
      ...options.headers,
    };

    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    if (this.actor) headers[ACTOR_HEADER] = this.actor;

    this.axios = axios.create({
      baseURL: this.baseUrl,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      headers,
      // Errors are raised by `request` so every failure becomes a NorienError.
      validateStatus: () => true,
    });
  }

  async request<T>(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    options: { query?: QueryParams; body?: unknown } = {},
  ): Promise<T> {
    const query = toQuery(options.query).toString();
    const url = query ? `${path}?${query}` : path;

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await this.axios.request({
          method,
          url,
          ...(options.body !== undefined ? { data: options.body } : {}),
        });

        if (response.status >= 200 && response.status < 300) {
          return response.data as T;
        }

        const shouldRetry =
          RETRYABLE_STATUS.has(response.status) &&
          IDEMPOTENT_METHODS.has(method) &&
          attempt < this.retries;

        if (!shouldRetry) {
          throw toNorienError({
            isAxiosError: true,
            message: `Request failed with status ${response.status}`,
            response: { status: response.status, data: response.data },
          });
        }

        lastError = response;
      } catch (error) {
        const normalised = toNorienError(error);

        // A connection failure is worth retrying; a 4xx never is.
        if (!normalised.isNetworkError || attempt >= this.retries) throw normalised;
        lastError = error;
      }

      // Exponential backoff: 200ms, 400ms, 800ms...
      await sleep(200 * 2 ** attempt);
    }

    throw toNorienError(lastError);
  }

  get<T>(path: string, query?: QueryParams): Promise<T> {
    return this.request<T>('get', path, { query });
  }

  post<T>(path: string, body?: unknown, query?: QueryParams): Promise<T> {
    return this.request<T>('post', path, { body, query });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('patch', path, { body });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('delete', path, {});
  }
}
