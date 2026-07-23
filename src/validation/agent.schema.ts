import { z } from 'zod';

import { SORTABLE_AGENT_FIELDS } from '../config/constants.js';
import { agentManifestSchema, commandsField, runtimeField } from './manifest.schema.js';
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
  urlField,
  versionField,
  visibilityField,
} from './common.js';

/**
 * `POST /agents`
 *
 * A manifest may be supplied instead of the individual fields. When both are
 * present the explicit fields win, so a caller can publish a manifest and
 * override presentation metadata in one request.
 */
export const createAgentSchema = z
  .object({
    slug: slugField.optional().describe('Derived from `name` when omitted.'),
    name: nameField.optional(),
    description: descriptionField.optional(),
    version: versionField.optional(),

    tags: tagsField.optional(),
    icon: urlField.optional(),
    readme: readmeField.optional(),

    permissions: permissionsField.optional(),
    required_tools: requiredToolsField.optional(),
    environment_variables: environmentVariablesField.optional(),

    entrypoint: z.string().trim().max(512).optional(),
    runtime: runtimeField.optional(),
    commands: commandsField.optional(),
    install_command: z.string().trim().max(512).optional(),
    api_endpoint: urlField.optional(),

    visibility: visibilityField.default('public'),
    manifest: agentManifestSchema.optional(),
  })
  .refine((value) => value.manifest !== undefined || value.name !== undefined, {
    message: 'Provide either a `manifest` or at least `name`, `description`, and `version`.',
    path: ['manifest'],
  });

export type CreateAgentInput = z.infer<typeof createAgentSchema>;

/**
 * `PATCH /agents/:slug`
 *
 * Only presentation and distribution metadata is patchable. Anything that a
 * consumer may have pinned -- version payloads, required tools of an already
 * published version -- must go through `POST /publish` instead.
 */
export const updateAgentSchema = z
  .object({
    name: nameField.optional(),
    description: descriptionField.optional(),
    tags: tagsField.optional(),
    icon: urlField.nullable().optional(),
    readme: readmeField.nullable().optional(),
    install_command: z.string().trim().max(512).nullable().optional(),
    api_endpoint: urlField.nullable().optional(),
    visibility: visibilityField.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

export const listAgentsQuerySchema = paginationQuery.extend({
  q: z.string().trim().min(1).max(200).optional().describe('Free-text search term.'),
  tag: csvArray(tagField).describe('Repeat or comma-separate to filter by several tags.'),
  author: z.string().trim().max(64).optional(),
  tool: slugField.optional().describe('Only agents that require this tool.'),
  runtime: runtimeField.optional().describe('Only agents targeting this runtime.'),
  visibility: visibilityField.optional(),
  sort: z.enum(SORTABLE_AGENT_FIELDS).default('created_at'),
  order: sortOrderField,
});

export type ListAgentsQuery = z.infer<typeof listAgentsQuerySchema>;

export const agentSlugParamsSchema = z.object({ slug: slugField });

export const agentVersionQuerySchema = z.object({
  version: z
    .string()
    .trim()
    .max(64)
    .optional()
    .describe('Exact version or range. Defaults to the latest published version.'),
});

// --- Responses ------------------------------------------------------------

export const environmentVariableResponseSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  required: z.boolean(),
  secret: z.boolean(),
  default: z.string().optional(),
});

export const agentResponseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  author: z.string(),
  tags: z.array(z.string()),
  icon: z.string().nullable(),
  readme: z.string().nullable(),
  permissions: z.array(z.string()),
  required_tools: z.array(z.string()),
  environment_variables: z.array(environmentVariableResponseSchema),
  entrypoint: z.string().nullable(),
  runtime: z.string().nullable(),
  commands: z.record(z.string(), z.string()),
  install_command: z.string(),
  api_endpoint: z.string().nullable(),
  visibility: visibilityField,
  manifest: z.record(z.string(), z.unknown()),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const agentVersionResponseSchema = z.object({
  version: z.string(),
  description: z.string(),
  required_tools: z.array(z.string()),
  permissions: z.array(z.string()),
  entrypoint: z.string().nullable(),
  runtime: z.string().nullable(),
  commands: z.record(z.string(), z.string()),
  created_at: z.iso.datetime(),
});
