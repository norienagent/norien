/**
 * The registry returns one error envelope for every failure:
 *
 *   { "error": { "code", "message", "details"[], "request_id" } }
 *
 * `NorienError` preserves all of it, so a caller can branch on a stable `code`
 * instead of parsing messages, and can quote `request_id` in a bug report.
 */

export interface NorienErrorDetail {
  field?: string;
  message: string;
  [key: string]: unknown;
}

export interface NorienErrorPayload {
  code: string;
  message: string;
  details?: NorienErrorDetail[];
  request_id?: string;
}

export class NorienError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details: NorienErrorDetail[];
  readonly requestId: string | null;
  override readonly cause?: unknown;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number | null;
      details?: NorienErrorDetail[];
      requestId?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'NorienError';
    this.code = options.code ?? 'UNKNOWN';
    this.status = options.status ?? null;
    this.details = options.details ?? [];
    this.requestId = options.requestId ?? null;
    this.cause = options.cause;
  }

  /** True when the registry could not be reached at all. */
  get isNetworkError(): boolean {
    return this.status === null && this.code === 'NETWORK_ERROR';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isValidationError(): boolean {
    return this.status === 422;
  }

  /** Multi-line rendering: the message plus each field-scoped detail. */
  format(): string {
    const lines = [this.message];

    for (const detail of this.details) {
      lines.push(detail.field ? `  ${detail.field}: ${detail.message}` : `  ${detail.message}`);
    }

    return lines.join('\n');
  }
}

function isErrorEnvelope(body: unknown): body is { error: NorienErrorPayload } {
  if (typeof body !== 'object' || body === null) return false;
  const envelope = (body as { error?: unknown }).error;
  return (
    typeof envelope === 'object' &&
    envelope !== null &&
    typeof (envelope as NorienErrorPayload).message === 'string'
  );
}

/** Normalises anything axios throws into a `NorienError`. */
export function toNorienError(error: unknown): NorienError {
  if (error instanceof NorienError) return error;

  const candidate = error as {
    isAxiosError?: boolean;
    message?: string;
    code?: string;
    response?: { status?: number; data?: unknown };
  };

  if (candidate?.isAxiosError) {
    const status = candidate.response?.status ?? null;
    const data = candidate.response?.data;

    if (isErrorEnvelope(data)) {
      return new NorienError(data.error.message, {
        code: data.error.code,
        status,
        details: data.error.details ?? [],
        requestId: data.error.request_id ?? null,
        cause: error,
      });
    }

    if (status === null) {
      return new NorienError(
        `Could not reach the registry: ${candidate.message ?? 'connection failed'}`,
        { code: 'NETWORK_ERROR', status: null, cause: error },
      );
    }

    return new NorienError(candidate.message ?? `Request failed with status ${status}`, {
      code: 'HTTP_ERROR',
      status,
      cause: error,
    });
  }

  return new NorienError(
    error instanceof Error ? error.message : String(error),
    { cause: error },
  );
}
