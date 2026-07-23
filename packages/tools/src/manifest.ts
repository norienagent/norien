import type { EnvironmentVariable, ToolAuthentication } from '@norien/sdk';

import { ToolError } from './errors.js';
import { type JsonSchema, validateAgainstSchema } from './schema-validator.js';

/**
 * `tool.json` -- the manifest a publisher writes.
 *
 * The category and runtime vocabularies mirror the registry's. They are a
 * published contract rather than internal logic, so restating them at the
 * client layer (for offline `tool publish` validation) is expected, not
 * duplication of behaviour.
 */

export const TOOL_CATEGORIES = [
  'search',
  'wallet',
  'blockchain',
  'storage',
  'browser',
  'filesystem',
  'database',
  'notification',
  'discord',
  'telegram',
  'twitter',
  'github',
  'email',
  'http',
  'rpc',
  'ai',
  'utility',
  'data',
  'communication',
  'productivity',
  'developer',
  'finance',
  'media',
  'security',
  'other',
] as const;

export const TOOL_RUNTIMES = ['node', 'python', 'http'] as const;
export type ToolRuntime = (typeof TOOL_RUNTIMES)[number];

export const TOOL_MANIFEST_FILENAME = 'tool.json';

export interface ToolManifest {
  name: string;
  slug?: string;
  version: string;
  description: string;
  category: string;
  runtime: ToolRuntime;
  entrypoint: string;
  input_schema: JsonSchema;
  output_schema: JsonSchema;
  authentication?: ToolAuthentication;
  environment?: (string | EnvironmentVariable)[];
  permissions?: string[];
  dependencies?: string[];
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  documentation?: string;
  [key: string]: unknown;
}

/**
 * The manifest shape, expressed as a JSON Schema so it can be checked with the
 * same validator that checks tool input and output.
 */
export const TOOL_MANIFEST_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['name', 'version', 'description', 'runtime', 'input_schema', 'output_schema'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 64 },
    version: { type: 'string', minLength: 1, maxLength: 64 },
    description: { type: 'string', minLength: 1, maxLength: 500 },
    category: { type: 'string', enum: [...TOOL_CATEGORIES] },
    runtime: { type: 'string', enum: [...TOOL_RUNTIMES] },
    entrypoint: { type: 'string', maxLength: 512 },
    input_schema: { type: 'object' },
    output_schema: { type: 'object' },
    authentication: { type: 'object' },
    environment: { type: 'array' },
    permissions: { type: 'array', items: { type: 'string' } },
    dependencies: { type: 'array', items: { type: 'string' } },
    author: { type: 'string', maxLength: 64 },
    license: { type: 'string', maxLength: 64 },
    homepage: { type: 'string', maxLength: 2048 },
    repository: { type: 'string', maxLength: 2048 },
    documentation: { type: 'string' },
  },
};

/**
 * Validates a raw `tool.json`.
 *
 * Structural problems and the cross-field rule (`http` and local runtimes both
 * need an entrypoint) are reported together, so a publisher sees every issue at
 * once rather than fixing them one at a time.
 */
export function validateToolManifest(raw: unknown): ToolManifest {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ToolError('MANIFEST_INVALID', 'tool.json must be a JSON object.');
  }

  const { valid, errors } = validateAgainstSchema(TOOL_MANIFEST_SCHEMA, raw);
  const manifest = raw as ToolManifest;

  const issues = errors.map((issue) => ({
    field: issue.path.replace(/^\//, '').replaceAll('/', '.') || undefined,
    message: issue.message,
  }));

  // Every runtime needs something to invoke.
  if (manifest.runtime && !manifest.entrypoint) {
    issues.push({
      field: 'entrypoint',
      message:
        manifest.runtime === 'http'
          ? 'An http tool requires an entrypoint (the URL to call).'
          : 'A node or python tool requires an entrypoint.',
    });
  }

  if (!valid || issues.length > 0) {
    throw new ToolError('MANIFEST_INVALID', 'tool.json is invalid.', {
      details: issues.filter((issue) => issue.message.length > 0),
      hint: 'Fix the fields above and try again.',
    });
  }

  return manifest;
}

/** Normalises the two accepted environment spellings to the descriptor form. */
export function normalizeEnvironment(
  environment: ToolManifest['environment'],
): EnvironmentVariable[] {
  if (!environment) return [];

  return environment.map((entry) =>
    typeof entry === 'string'
      ? { name: entry, required: true, secret: false }
      : {
          name: entry.name,
          ...(entry.description !== undefined ? { description: entry.description } : {}),
          required: entry.required ?? true,
          secret: entry.secret ?? false,
          ...(entry.default !== undefined ? { default: entry.default } : {}),
        },
  );
}
