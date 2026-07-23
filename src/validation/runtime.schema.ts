import { z } from 'zod';

import { RUNTIMES } from '../config/constants.js';
import { agentManifestSchema, runtimeField } from './manifest.schema.js';
import { environmentVariableResponseSchema } from './agent.schema.js';
import { slugField } from './common.js';

/**
 * Schemas for the runtime layer.
 *
 * The runtime layer *describes* an agent -- it never executes one -- so every
 * shape here is a report: what was detected, what resolved, and what is still
 * missing.
 */

/**
 * Environment the caller can supply. Accepts a list of names or a full map;
 * only names are ever used, so secrets are never stored or logged.
 */
export const providedEnvironmentField = z
  .union([
    z.array(z.string().max(200)).max(200),
    z.record(z.string().max(200), z.string().max(10_000)),
  ])
  .optional()
  .describe('Environment variable names (or a name/value map) available to the agent.');

/** `?environment=A,B` for the GET variant. */
export const providedEnvironmentQuery = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    const raw = Array.isArray(value) ? value : [value];
    return raw
      .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '');
  }, z.array(z.string().max(200)).max(200).optional())
  .describe('Comma-separated environment variable names available to the agent.');

export const runtimeInspectSchema = z.object({
  manifest: agentManifestSchema.describe('The agent.json document to inspect.'),
  environment: providedEnvironmentField,
  slug: slugField.optional().describe('Slug to check the version against. Derived from `name` when omitted.'),
});

export const runtimeQuerySchema = z.object({ environment: providedEnvironmentQuery });

// --- Responses ------------------------------------------------------------

export const runtimeDescriptorSchema = z
  .object({
    name: z.enum(RUNTIMES),
    source: z.enum(['declared', 'inferred']),
    entrypoint: z.string(),
    interpreter: z.string(),
    manifest_file: z.string(),
    commands: z.object({ start: z.string(), health: z.string().nullable() }),
  })
  .meta({
    id: 'RuntimeDescriptor',
    examples: [
      {
        name: 'node',
        source: 'declared',
        entrypoint: 'dist/index.js',
        interpreter: 'node',
        manifest_file: 'package.json',
        commands: { start: 'node dist/index.js', health: '/health' },
      },
    ],
  });

export const resolvedToolSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  version: z.string(),
  category: z.string(),
  description: z.string(),
  runtime: z.string().nullable(),
  entrypoint: z.string().nullable(),
  authentication: z.record(z.string(), z.unknown()),
  input_schema: z.record(z.string(), z.unknown()),
  output_schema: z.record(z.string(), z.unknown()),
  permissions: z.array(z.string()),
  environment: z.array(environmentVariableResponseSchema),
});

export const toolResolutionSchema = z
  .object({
    requested: z.array(z.string()),
    resolved: z.array(resolvedToolSchema),
    missing: z.array(z.string()).describe('Declared tools with no published implementation.'),
    satisfied: z.boolean(),
  })
  .meta({ id: 'ToolResolution' });

export const environmentReportSchema = z
  .object({
    variables: z.array(environmentVariableResponseSchema),
    required: z.array(z.string()),
    optional: z.array(z.string()),
    secrets: z.array(z.string()),
    provided: z.array(z.string()),
    missing: z.array(z.string()).describe('Required variables the caller has not supplied.'),
    satisfied: z.boolean(),
  })
  .meta({ id: 'EnvironmentReport' });

export const versionReportSchema = z.object({
  requested: z.string(),
  latest_published: z.string().nullable(),
  action: z.enum(['create', 'new_version', 'conflict']),
  conflict_reason: z.string().nullable(),
  acceptable: z.boolean(),
});

export const diagnosticSchema = z.object({
  level: z.enum(['error', 'warning']),
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
});

export const normalizedAgentSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    version: z.string(),
    description: z.string(),
    runtime: runtimeDescriptorSchema,
    permissions: z.array(z.string()),
    dependencies: toolResolutionSchema,
    environment: environmentReportSchema,
    version_check: versionReportSchema,
    install: z.object({ command: z.string(), api_endpoint: z.string() }),
    manifest: z.record(z.string(), z.unknown()),
    ready: z.boolean().describe('True when dependencies and environment are both satisfied.'),
    diagnostics: z.array(diagnosticSchema),
  })
  .meta({
    id: 'NormalizedAgent',
    description:
      'The platform\'s understanding of an agent: detected runtime, resolved tools, environment readiness, and version status. Nothing is executed.',
  });

export { runtimeField };
