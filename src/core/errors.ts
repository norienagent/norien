/**
 * A single error taxonomy for the whole application. Services and repositories
 * throw these; the HTTP error handler is the only place that knows how to turn
 * them into a response. Transports added later (CLI, gRPC, MCP) can map the
 * same codes without touching business logic.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'MANIFEST_INVALID'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SLUG_TAKEN'
  | 'VERSION_EXISTS'
  | 'VERSION_NOT_INCREASING'
  | 'DEPENDENCY_MISSING'
  | 'UNPROCESSABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  MANIFEST_INVALID: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  SLUG_TAKEN: 409,
  VERSION_EXISTS: 409,
  VERSION_NOT_INCREASING: 409,
  DEPENDENCY_MISSING: 422,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export interface ErrorDetail {
  /** Dotted path to the offending field, when the error is field-scoped. */
  field?: string;
  message: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: ErrorDetail[];
  override readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: ErrorDetail[]; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.details = options.details ?? [];
    this.cause = options.cause;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message: string, details?: ErrorDetail[]): AppError {
    return new AppError('BAD_REQUEST', message, { details });
  }

  static validation(message: string, details?: ErrorDetail[]): AppError {
    return new AppError('VALIDATION_ERROR', message, { details });
  }

  static unauthorized(message = 'Authentication is required.'): AppError {
    return new AppError('UNAUTHORIZED', message);
  }

  static forbidden(message = 'You do not have access to this resource.'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  /** `resource` is the entity type, `identifier` the slug or id that missed. */
  static notFound(resource: string, identifier?: string): AppError {
    const suffix = identifier ? ` '${identifier}'` : '';
    return new AppError('NOT_FOUND', `${resource}${suffix} was not found.`);
  }

  static conflict(message: string, details?: ErrorDetail[]): AppError {
    return new AppError('CONFLICT', message, { details });
  }

  static slugTaken(resource: string, slug: string): AppError {
    return new AppError('SLUG_TAKEN', `The slug '${slug}' is already used by another ${resource}.`, {
      details: [{ field: 'slug', message: 'Slug must be unique.', slug }],
    });
  }

  static internal(message = 'An unexpected error occurred.', cause?: unknown): AppError {
    return new AppError('INTERNAL', message, { cause });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
