import { z } from 'zod';

import {
  DESCRIPTION_MAX_LENGTH,
  ENVIRONMENT_VARIABLE_PATTERN,
  MAX_ENVIRONMENT_VARIABLES,
  MAX_PERMISSIONS,
  MAX_REQUIRED_TOOLS,
  MAX_TAGS_PER_AGENT,
  NAME_MAX_LENGTH,
  PERMISSION_PATTERN,
  README_MAX_LENGTH,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
  TAG_MAX_LENGTH,
  TAG_PATTERN,
} from '../config/constants.js';
import { env } from '../config/env.js';

/**
 * Reusable field primitives. Defining them once means the create schema, the
 * patch schema, the manifest schema, and the OpenAPI document can never drift
 * apart.
 */

export const slugField = z
  .string()
  .min(SLUG_MIN_LENGTH)
  .max(SLUG_MAX_LENGTH)
  .regex(SLUG_PATTERN, 'Must be lowercase alphanumeric segments separated by single hyphens.')
  .describe('URL-safe unique identifier, e.g. "weather-agent".');

export const nameField = z.string().trim().min(1).max(NAME_MAX_LENGTH);

export const descriptionField = z.string().trim().min(1).max(DESCRIPTION_MAX_LENGTH);

export const versionField = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe('Semantic version, e.g. "1.0.0".');

export const readmeField = z.string().max(README_MAX_LENGTH);

export const tagField = z
  .string()
  .trim()
  .toLowerCase()
  .max(TAG_MAX_LENGTH)
  .regex(TAG_PATTERN, 'Tags must be lowercase alphanumeric segments separated by hyphens.');

export const tagsField = z.array(tagField).max(MAX_TAGS_PER_AGENT);

export const permissionField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(PERMISSION_PATTERN, 'Permissions use a "namespace:action" form, e.g. "network:fetch".');

export const permissionsField = z.array(permissionField).max(MAX_PERMISSIONS);

export const requiredToolsField = z.array(slugField).max(MAX_REQUIRED_TOOLS);

/**
 * Environment variables accept either a bare name (`"API_KEY"`) or a full
 * descriptor object, and always normalise to the descriptor form so storage
 * and responses have one shape.
 */
export const environmentVariableField = z.union([
  z.string().regex(ENVIRONMENT_VARIABLE_PATTERN, 'Use SCREAMING_SNAKE_CASE.'),
  z.object({
    name: z.string().regex(ENVIRONMENT_VARIABLE_PATTERN, 'Use SCREAMING_SNAKE_CASE.'),
    description: z.string().max(DESCRIPTION_MAX_LENGTH).optional(),
    required: z.boolean().default(true),
    secret: z.boolean().default(false),
    default: z.string().max(1000).optional(),
  }),
]);

export const environmentVariablesField = z
  .array(environmentVariableField)
  .max(MAX_ENVIRONMENT_VARIABLES);

export const visibilityField = z.enum(['public', 'private']);

export const urlField = z.string().url().max(2048);

/** Standard pagination query parameters, shared by every list endpoint. */
export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(env.MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const sortOrderField = z.enum(['asc', 'desc']).default('desc');

/** Accepts `?tag=a&tag=b` and `?tag=a,b` alike. */
export const csvArray = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    const raw = Array.isArray(value) ? value : [value];
    return raw
      .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : [entry]))
      .map((entry) => (typeof entry === 'string' ? entry.trim() : entry))
      .filter((entry) => entry !== '');
  }, z.array(item).optional());

export const pageMetaSchema = z.object({
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  has_more: z.boolean(),
  next_offset: z.number().int().nullable(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ field: z.string().optional(), message: z.string() }).loose())
      .optional(),
    request_id: z.string().optional(),
  }),
});

/** Wraps an item schema in the standard `{ data, meta }` list envelope. */
export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: z.array(item), meta: pageMetaSchema });
