import type { ZodType, ZodError } from 'zod';

import { AppError, type ErrorCode, type ErrorDetail } from '../core/errors.js';

/** Flattens a Zod error into the transport-neutral detail list. */
export function toErrorDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : undefined,
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validates data that arrived from somewhere other than the HTTP schema layer
 * -- a manifest body, a seed file, a future CLI upload -- and reports failures
 * using the same error shape as route validation.
 */
export function parseOrThrow<T extends ZodType>(
  schema: T,
  data: unknown,
  options: { code?: ErrorCode; message?: string } = {},
): ReturnType<T['parse']> {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new AppError(
      options.code ?? 'VALIDATION_ERROR',
      options.message ?? 'The provided payload failed validation.',
      { details: toErrorDetails(result.error) },
    );
  }

  return result.data as ReturnType<T['parse']>;
}
