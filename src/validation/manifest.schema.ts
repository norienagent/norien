import { z } from 'zod';

import { COMMAND_MAX_LENGTH, RUNTIMES } from '../config/constants.js';
import type { AgentCommands, EnvironmentVariableSpec } from '../db/schema/agents.js';
import {
  descriptionField,
  environmentVariablesField,
  nameField,
  permissionsField,
  requiredToolsField,
  versionField,
} from './common.js';

/**
 * `agent.json` -- the contract a publisher submits.
 *
 * Unknown top-level keys are preserved rather than stripped: a manifest is a
 * document the publisher owns, and forward-compatible fields (MCP descriptors,
 * deployment hints) should survive a round trip through an older registry.
 */

export const runtimeField = z
  .enum(RUNTIMES)
  .describe('Execution runtime. Inferred from the entrypoint extension when omitted.');

export const commandsField = z
  .object({
    start: z
      .string()
      .trim()
      .min(1)
      .max(COMMAND_MAX_LENGTH)
      .optional()
      .describe('Command that starts the agent. Derived from the runtime when omitted.'),
    health: z
      .string()
      .trim()
      .min(1)
      .max(COMMAND_MAX_LENGTH)
      .optional()
      .describe('Command or HTTP path that reports agent health.'),
  })
  .loose()
  .describe('Lifecycle commands. Recorded now; executed in a later phase.');

export const agentManifestSchema = z
  .object({
    name: nameField.describe('Human-readable agent name.'),
    version: versionField,
    description: descriptionField,
    runtime: runtimeField.optional(),
    entrypoint: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .describe('Module, script, or binary that starts the agent.'),
    tools: requiredToolsField.default([]).describe('Slugs of tools this agent requires.'),
    permissions: permissionsField.default([]),
    environment: environmentVariablesField.default([]),
    commands: commandsField.default({}),
  })
  .loose()
  .meta({
    id: 'AgentManifest',
    title: 'agent.json',
    examples: [
      {
        name: 'Research Agent',
        version: '1.0.0',
        description: 'Searches the web and summarises findings with citations.',
        runtime: 'node',
        entrypoint: 'dist/index.js',
        tools: ['search', 'http-fetch'],
        permissions: ['network:fetch'],
        environment: [{ name: 'SEARCH_API_KEY', required: true, secret: true }],
        commands: { start: 'node dist/index.js', health: '/health' },
      },
    ],
  });

export type AgentManifestInput = z.input<typeof agentManifestSchema>;
export type ParsedManifest = z.output<typeof agentManifestSchema>;

/**
 * Collapses the two accepted environment-variable spellings into the single
 * stored form.
 */
export function normaliseEnvironmentVariables(
  input: ParsedManifest['environment'] | undefined,
): EnvironmentVariableSpec[] {
  if (!input) return [];

  return input.map((entry) =>
    typeof entry === 'string'
      ? { name: entry, required: true, secret: false }
      : {
          name: entry.name,
          ...(entry.description !== undefined ? { description: entry.description } : {}),
          required: entry.required,
          secret: entry.secret,
          ...(entry.default !== undefined ? { default: entry.default } : {}),
        },
  );
}

/** Drops the keys the manifest defines itself, keeping publisher extensions. */
export function normaliseCommands(input: ParsedManifest['commands'] | undefined): AgentCommands {
  if (!input) return {};

  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => typeof value === 'string' && value.length > 0),
  ) as AgentCommands;
}

/** Removes duplicates while preserving the publisher's ordering. */
export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
