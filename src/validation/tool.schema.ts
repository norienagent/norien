import { z } from 'zod';

import {
  MAX_ENVIRONMENT_VARIABLES,
  MAX_PERMISSIONS,
  MAX_TOOL_DEPENDENCIES,
  SORTABLE_TOOL_FIELDS,
  TOOL_CATEGORIES,
  TOOL_RUNTIMES,
} from '../config/constants.js';
import {
  csvArray,
  descriptionField,
  environmentVariablesField,
  nameField,
  paginationQuery,
  permissionsField,
  readmeField,
  requiredToolsField,
  slugField,
  sortOrderField,
  tagField,
  tagsField,
  versionField,
  visibilityField,
} from './common.js';

/**
 * A JSON Schema document. The registry stores and serves these verbatim rather
 * than interpreting them -- a tool runtime is the consumer, not this service --
 * but the outer shape is checked so callers cannot store a string or array
 * where an object belongs.
 */
export const jsonSchemaDocument = z
  .record(z.string(), z.unknown())
  .describe('A JSON Schema document describing the payload shape.');

export const toolAuthenticationSchema = z
  .object({
    type: z.enum(['none', 'api_key', 'oauth2', 'bearer', 'basic', 'custom']).default('none'),
    location: z.enum(['header', 'query', 'body']).optional(),
    name: z.string().max(120).optional(),
    scopes: z.array(z.string().max(120)).max(50).optional(),
    description: z.string().max(500).optional(),
  })
  .loose()
  .refine((value) => value.type !== 'api_key' || (value.location && value.name), {
    message: 'api_key authentication requires `location` and `name`.',
  });

/**
 * Category is validated against the marketplace vocabulary. Unknown categories
 * are rejected rather than silently stored, so the marketplace's facets stay
 * meaningful.
 */
export const toolCategoryField = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => (TOOL_CATEGORIES as readonly string[]).includes(value), {
    message: `Category must be one of: ${TOOL_CATEGORIES.join(', ')}.`,
  });

export const toolRuntimeField = z
  .enum(TOOL_RUNTIMES)
  .describe('How the tool executes: node, python, or http.');

export const toolDependenciesField = z.array(slugField).max(MAX_TOOL_DEPENDENCIES);

const licenseField = z.string().trim().max(64);
const urlishField = z.string().trim().max(2048);

/**
 * `tool.json` -- the manifest a publisher submits.
 *
 * The shape mirrors `agent.json`: identity, an execution runtime with an
 * entrypoint, declared environment and permissions, and the input/output
 * schemas that make a tool callable. Unknown top-level keys are preserved so
 * forward-compatible fields survive a round trip.
 */
export const createToolSchema = z
  .object({
    slug: slugField.optional().describe('Derived from `name` when omitted.'),
    name: nameField,
    description: descriptionField,
    version: versionField.default('1.0.0'),
    category: toolCategoryField.default('utility'),
    tags: tagsField.optional(),

    runtime: toolRuntimeField.optional(),
    entrypoint: z.string().trim().max(512).optional(),

    input_schema: jsonSchemaDocument,
    output_schema: jsonSchemaDocument,
    authentication: toolAuthenticationSchema.optional(),
    environment: environmentVariablesField.max(MAX_ENVIRONMENT_VARIABLES).optional(),
    permissions: permissionsField.max(MAX_PERMISSIONS).optional(),
    dependencies: toolDependenciesField.optional(),

    license: licenseField.optional(),
    homepage: urlishField.optional(),
    repository: urlishField.optional(),

    documentation: readmeField.optional(),
    visibility: visibilityField.default('public'),
  })
  .loose()
  .refine((value) => value.runtime !== 'http' || value.entrypoint !== undefined, {
    message: 'An http tool requires an `entrypoint` (the URL to call).',
    path: ['entrypoint'],
  })
  .refine(
    (value) => value.runtime === undefined || value.runtime === 'http' || value.entrypoint !== undefined,
    {
      message: 'A node or python tool requires an `entrypoint`.',
      path: ['entrypoint'],
    },
  );

export type CreateToolInput = z.infer<typeof createToolSchema>;

export const updateToolSchema = z
  .object({
    name: nameField.optional(),
    description: descriptionField.optional(),
    category: toolCategoryField.optional(),
    tags: tagsField.optional(),
    documentation: readmeField.nullable().optional(),
    license: licenseField.nullable().optional(),
    homepage: urlishField.nullable().optional(),
    repository: urlishField.nullable().optional(),
    visibility: visibilityField.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateToolInput = z.infer<typeof updateToolSchema>;

export const listToolsQuerySchema = paginationQuery.extend({
  q: z.string().trim().min(1).max(200).optional(),
  category: toolCategoryField.optional(),
  runtime: toolRuntimeField.optional(),
  tag: csvArray(tagField),
  author: z.string().trim().max(64).optional(),
  visibility: visibilityField.optional(),
  sort: z.enum(SORTABLE_TOOL_FIELDS).default('created_at'),
  order: sortOrderField,
});

export type ListToolsQuery = z.infer<typeof listToolsQuerySchema>;

/** `GET /tools/search` -- a search term is required; filters are optional. */
export const searchToolsQuerySchema = paginationQuery.extend({
  q: z.string().trim().min(1).max(200).describe('Search term.'),
  category: toolCategoryField.optional(),
  runtime: toolRuntimeField.optional(),
  tag: csvArray(tagField),
  author: z.string().trim().max(64).optional(),
});

export type SearchToolsQuery = z.infer<typeof searchToolsQuerySchema>;

export const toolSlugParamsSchema = z.object({ slug: slugField });

export const toolInstallQuerySchema = z.object({
  version: z
    .string()
    .trim()
    .max(64)
    .optional()
    .describe('Exact version or semver range. Defaults to the latest published version.'),
});

// --- Responses ------------------------------------------------------------

const toolEnvironmentVariableSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  required: z.boolean(),
  secret: z.boolean(),
  default: z.string().optional(),
});

export const toolResponseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  category: z.string(),
  author: z.string(),
  tags: z.array(z.string()),
  runtime: z.string().nullable(),
  entrypoint: z.string().nullable(),
  input_schema: z.record(z.string(), z.unknown()),
  output_schema: z.record(z.string(), z.unknown()),
  authentication: z.record(z.string(), z.unknown()),
  environment: z.array(toolEnvironmentVariableSchema),
  permissions: z.array(z.string()),
  dependencies: z.array(z.string()),
  license: z.string().nullable(),
  homepage: z.string().nullable(),
  repository: z.string().nullable(),
  documentation: z.string().nullable(),
  visibility: visibilityField,
  install_command: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const toolVersionResponseSchema = z.object({
  version: z.string(),
  description: z.string(),
  runtime: z.string().nullable(),
  entrypoint: z.string().nullable(),
  input_schema: z.record(z.string(), z.unknown()),
  output_schema: z.record(z.string(), z.unknown()),
  authentication: z.record(z.string(), z.unknown()),
  environment: z.array(toolEnvironmentVariableSchema),
  permissions: z.array(z.string()),
  dependencies: z.array(z.string()),
  documentation: z.string().nullable(),
  created_at: z.iso.datetime(),
});

/**
 * `POST /tools/install` -- everything a client needs to materialise and run a
 * tool locally: the resolved manifest plus the concrete version it resolved to.
 */
export const toolInstallResultSchema = z.object({
  tool: toolResponseSchema,
  resolved_version: z.string(),
  dependencies: z.array(toolResponseSchema),
  install_command: z.string(),
});

// Referenced by common.ts; re-exported here for the routes.
export { requiredToolsField };
