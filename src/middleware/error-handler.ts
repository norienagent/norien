import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';

import { isProduction } from '../config/env.js';
import { AppError, type ErrorDetail, isAppError } from '../core/errors.js';

/**
 * The single place an error becomes a response.
 *
 * Every failure -- domain, validation, or unexpected -- leaves the API in the
 * same envelope, so a client can write one error path:
 *
 *   { "error": { "code", "message", "details"[], "request_id" } }
 */
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
    request_id: string;
  };
}

function buildBody(
  code: string,
  message: string,
  requestId: string,
  details?: ErrorDetail[],
): ErrorBody {
  return {
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
      request_id: requestId,
    },
  };
}

/** Postgres unique-violation, surfaced when two writers race past a check. */
function asUniqueViolation(error: unknown): AppError | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (code !== '23505') return null;

  const constraint = String((error as { constraint_name?: unknown }).constraint_name ?? '');

  if (constraint.includes('agents_slug')) return AppError.slugTaken('agent', 'requested slug');
  if (constraint.includes('tools_slug')) return AppError.slugTaken('tool', 'requested slug');
  if (constraint.includes('version')) {
    return new AppError('VERSION_EXISTS', 'That version has already been published.');
  }

  return AppError.conflict('That record already exists.');
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    void reply
      .status(404)
      .send(
        buildBody('NOT_FOUND', `Route ${request.method} ${request.url} does not exist.`, request.id),
      );
  });

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (isAppError(error)) {
      if (error.statusCode >= 500) request.log.error({ err: error }, 'domain error');
      void reply
        .status(error.statusCode)
        .send(buildBody(error.code, error.message, request.id, error.details));
      return;
    }

    // Request schema validation, mapped to the same detail shape services use.
    if (hasZodFastifySchemaValidationErrors(error)) {
      const details: ErrorDetail[] = error.validation.map((issue) => ({
        field: issue.instancePath.replace(/^\//, '').replaceAll('/', '.') || undefined,
        message: issue.message ?? 'Invalid value.',
      }));

      void reply
        .status(422)
        .send(buildBody('VALIDATION_ERROR', 'Request validation failed.', request.id, details));
      return;
    }

    // A response that does not match its declared schema is our bug, not the
    // caller's -- log it loudly and return 500 rather than leaking a 4xx.
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error, route: error.method }, 'response serialization failed');
      void reply
        .status(500)
        .send(buildBody('INTERNAL', 'The server produced an invalid response.', request.id));
      return;
    }

    const conflict = asUniqueViolation(error);
    if (conflict) {
      void reply
        .status(conflict.statusCode)
        .send(buildBody(conflict.code, conflict.message, request.id, conflict.details));
      return;
    }

    if (error.statusCode === 429) {
      void reply
        .status(429)
        .send(buildBody('RATE_LIMITED', 'Too many requests. Slow down.', request.id));
      return;
    }

    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      void reply
        .status(error.statusCode)
        .send(buildBody(error.code ?? 'BAD_REQUEST', error.message, request.id));
      return;
    }

    request.log.error({ err: error }, 'unhandled error');

    void reply
      .status(500)
      .send(
        buildBody(
          'INTERNAL',
          isProduction ? 'An unexpected error occurred.' : error.message,
          request.id,
        ),
      );
  });
}
