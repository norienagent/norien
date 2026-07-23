import { env } from '../config/env.js';
import type { AgentCommands, AgentRow, AgentVersionRow } from '../db/schema/agents.js';
import type { InstallationWithNames } from '../repositories/installation.repository.js';
import type { ToolRow, ToolVersionRow } from '../db/schema/tools.js';

/**
 * The single boundary between database rows and the public JSON contract.
 *
 * API responses are snake_case and expose slugs and handles rather than
 * internal foreign keys, so the storage layer can be reshaped without breaking
 * clients. Nothing outside this file should build a response body.
 */

const iso = (value: Date) => value.toISOString();

/** Renders the configured install-command template for an agent. */
export function renderInstallCommand(slug: string, version: string): string {
  return env.INSTALL_COMMAND_TEMPLATE.replaceAll('{slug}', slug).replaceAll('{version}', version);
}

/** Default API endpoint for an agent that did not declare its own. */
export function defaultApiEndpoint(slug: string): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/agents/${slug}`;
}

/** Install command for a marketplace tool. */
export function renderToolInstallCommand(slug: string, version: string): string {
  return `norien tool install ${slug}@${version}`;
}

/**
 * Commands are stored as jsonb, so a row may carry null or absent entries.
 * Responses expose a dense string map rather than leaking those holes.
 */
function serializeCommands(commands: AgentCommands): Record<string, string> {
  return Object.fromEntries(
    Object.entries(commands).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
    ),
  );
}

export function serializeAgent(row: AgentRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    version: row.latestVersion,
    author: row.authorHandle,
    tags: row.tags,
    icon: row.icon,
    readme: row.readme,
    permissions: row.permissions,
    required_tools: row.requiredTools,
    environment_variables: row.environmentVariables,
    entrypoint: row.entrypoint,
    runtime: row.runtime,
    commands: serializeCommands(row.commands),
    install_command: row.installCommand ?? renderInstallCommand(row.slug, row.latestVersion),
    api_endpoint: row.apiEndpoint ?? defaultApiEndpoint(row.slug),
    visibility: row.visibility,
    manifest: row.manifest,
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

export function serializeAgentVersion(row: AgentVersionRow) {
  return {
    version: row.version,
    description: row.description,
    required_tools: row.requiredTools,
    permissions: row.permissions,
    entrypoint: row.entrypoint,
    runtime: row.runtime,
    commands: serializeCommands(row.commands),
    created_at: iso(row.createdAt),
  };
}

export function serializeTool(row: ToolRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    version: row.latestVersion,
    category: row.category,
    author: row.authorHandle,
    tags: row.tags,
    runtime: row.runtime,
    entrypoint: row.entrypoint,
    input_schema: row.inputSchema,
    output_schema: row.outputSchema,
    authentication: row.authentication,
    environment: row.environmentVariables,
    permissions: row.permissions,
    dependencies: row.dependencies,
    license: row.license,
    homepage: row.homepage,
    repository: row.repository,
    documentation: row.documentation,
    visibility: row.visibility,
    install_command: renderToolInstallCommand(row.slug, row.latestVersion),
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

export function serializeToolVersion(row: ToolVersionRow) {
  return {
    version: row.version,
    description: row.description,
    runtime: row.runtime,
    entrypoint: row.entrypoint,
    input_schema: row.inputSchema,
    output_schema: row.outputSchema,
    authentication: row.authentication,
    environment: row.environmentVariables,
    permissions: row.permissions,
    dependencies: row.dependencies,
    documentation: row.documentation,
    created_at: iso(row.createdAt),
  };
}

export function serializeInstallation(row: InstallationWithNames) {
  return {
    id: row.id,
    user: row.userHandle,
    agent: row.agentSlug,
    installed_version: row.installedVersion,
    installed_at: iso(row.installedAt),
    uninstalled_at: row.uninstalledAt ? iso(row.uninstalledAt) : null,
  };
}
