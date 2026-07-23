import { z } from 'zod';

import { agentResponseSchema } from './agent.schema.js';
import { paginationQuery, slugField } from './common.js';
import {
  diagnosticSchema,
  environmentReportSchema,
  providedEnvironmentField,
  runtimeDescriptorSchema,
  toolResolutionSchema,
} from './runtime.schema.js';

/**
 * `POST /install`
 *
 * `version` accepts an exact version or a semver range; the service resolves it
 * against what has actually been published and records the concrete result, so
 * an installation always points at a real immutable version.
 */
export const installRequestSchema = z
  .object({
    agent: slugField.describe('Slug of the agent to install.'),
    version: z
      .string()
      .trim()
      .max(64)
      .optional()
      .describe('Exact version or semver range. Defaults to latest.'),
    environment: providedEnvironmentField,
  })
  .meta({
    id: 'InstallRequest',
    examples: [{ agent: 'research-agent', version: '^1.0.0', environment: ['SEARCH_API_KEY'] }],
  });

export type InstallRequestInput = z.infer<typeof installRequestSchema>;

export const uninstallRequestSchema = z.object({ agent: slugField });

export const listInstallationsQuerySchema = paginationQuery.extend({
  include_uninstalled: z.coerce.boolean().default(false),
});

export const installationResponseSchema = z.object({
  id: z.uuid(),
  user: z.string(),
  agent: z.string(),
  installed_version: z.string(),
  installed_at: z.iso.datetime(),
  uninstalled_at: z.iso.datetime().nullable(),
});

/**
 * Everything a CLI needs to install and start an agent in one round trip: the
 * install command, the manifest, resolved tool metadata, the detected runtime,
 * and which environment variables still need values.
 */
export const installResultSchema = z
  .object({
    installation: installationResponseSchema,
    agent: agentResponseSchema,
    install_command: z.string(),
    manifest: z.record(z.string(), z.unknown()),
    runtime: runtimeDescriptorSchema,
    dependencies: toolResolutionSchema,
    environment: environmentReportSchema,
    permissions: z.array(z.string()),
    ready: z.boolean(),
    diagnostics: z.array(diagnosticSchema),
  })
  .meta({ id: 'InstallResult' });
