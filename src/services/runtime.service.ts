import path from 'node:path';

import {
  RUNTIMES,
  RUNTIME_BY_EXTENSION,
  RUNTIME_INTERPRETER,
  RUNTIME_MANIFEST_FILES,
  type RuntimeName,
} from '../config/constants.js';
import { AppError } from '../core/errors.js';
import type { AgentCommands, AgentManifest, AgentRow, EnvironmentVariableSpec } from '../db/schema/agents.js';
import type { AgentRepository } from '../repositories/agent.repository.js';
import type { AgentVersionRepository } from '../repositories/agent-version.repository.js';
import { compareVersions, highestVersion, parseVersion } from '../utils/semver.js';
import { defaultApiEndpoint, renderInstallCommand } from '../utils/serializers.js';
import { slugify } from '../utils/slug.js';
import { parseOrThrow } from '../validation/parse.js';
import {
  type ParsedManifest,
  agentManifestSchema,
  normaliseCommands,
  normaliseEnvironmentVariables,
  unique,
} from '../validation/manifest.schema.js';
import type { ToolResolution, ToolResolverService } from './tool-resolver.service.js';

/**
 * The runtime layer.
 *
 * The platform must *understand* an agent without running it: parse the
 * manifest, detect the runtime, resolve tool dependencies, verify the version
 * against what is published, and check which environment variables are
 * satisfied. The result is one normalized object that a CLI, an installer, or
 * a future executor can all act on.
 *
 * Nothing here executes anything or touches the filesystem of an agent.
 */

export interface RuntimeDescriptor {
  name: RuntimeName;
  /** Whether the publisher declared the runtime or we inferred it. */
  source: 'declared' | 'inferred';
  entrypoint: string;
  interpreter: string;
  /** Dependency manifest a publisher of this runtime is expected to ship. */
  manifest_file: string;
  commands: { start: string; health: string | null };
}

export interface EnvironmentReport {
  variables: EnvironmentVariableSpec[];
  required: string[];
  optional: string[];
  secrets: string[];
  /** Names the caller reported as available. */
  provided: string[];
  /** Required names the caller did not provide. */
  missing: string[];
  satisfied: boolean;
}

export interface VersionReport {
  requested: string;
  latest_published: string | null;
  /** What publishing this manifest would do. */
  action: 'create' | 'new_version' | 'conflict';
  conflict_reason: string | null;
  acceptable: boolean;
}

export interface Diagnostic {
  level: 'error' | 'warning';
  code: string;
  message: string;
  field?: string;
}

/** The normalized object every runtime consumer receives. */
export interface NormalizedAgent {
  slug: string;
  name: string;
  version: string;
  description: string;
  runtime: RuntimeDescriptor;
  permissions: string[];
  dependencies: ToolResolution;
  environment: EnvironmentReport;
  version_check: VersionReport;
  install: { command: string; api_endpoint: string };
  manifest: AgentManifest;
  /** True when the agent could be installed and started as-is. */
  ready: boolean;
  diagnostics: Diagnostic[];
}

/** Accepts either a list of names or a full env map. */
export type ProvidedEnvironment = readonly string[] | Readonly<Record<string, string>>;

function providedNames(input: ProvidedEnvironment | undefined): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return unique(input as readonly string[]);

  // Only names matter here; values are never stored or logged.
  return unique(
    Object.entries(input as Record<string, string>)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([name]) => name),
  );
}

export class RuntimeService {
  constructor(
    private readonly tools: ToolResolverService,
    private readonly agents: AgentRepository,
    private readonly agentVersions: AgentVersionRepository,
  ) {}

  /**
   * Resolves the runtime of a manifest.
   *
   * A declared `runtime` always wins. Otherwise the entrypoint extension
   * decides, which keeps hand-written and older manifests usable. When
   * neither resolves, the error names the supported runtimes rather than
   * saying "invalid".
   */
  detectRuntime(manifest: {
    runtime?: string | undefined;
    entrypoint: string;
    commands?: AgentCommands | undefined;
  }): RuntimeDescriptor {
    const declared = manifest.runtime;
    let name: RuntimeName;
    let source: 'declared' | 'inferred';

    if (declared) {
      if (!(RUNTIMES as readonly string[]).includes(declared)) {
        throw new AppError('MANIFEST_INVALID', `Unsupported runtime '${declared}'.`, {
          details: [
            {
              field: 'runtime',
              message: `Supported runtimes are: ${RUNTIMES.join(', ')}.`,
              value: declared,
            },
          ],
        });
      }
      name = declared as RuntimeName;
      source = 'declared';
    } else {
      const extension = path.extname(manifest.entrypoint).toLowerCase();
      const inferred = RUNTIME_BY_EXTENSION[extension];

      if (!inferred) {
        throw new AppError(
          'MANIFEST_INVALID',
          `Unable to determine a runtime for entrypoint '${manifest.entrypoint}'.`,
          {
            details: [
              {
                field: 'runtime',
                message: `Declare "runtime" as one of: ${RUNTIMES.join(', ')}, or use an entrypoint ending in ${Object.keys(RUNTIME_BY_EXTENSION).join(', ')}.`,
                entrypoint: manifest.entrypoint,
              },
            ],
          },
        );
      }

      name = inferred;
      source = 'inferred';
    }

    const interpreter = RUNTIME_INTERPRETER[name];
    const commands = manifest.commands ?? {};

    return {
      name,
      source,
      entrypoint: manifest.entrypoint,
      interpreter,
      manifest_file: RUNTIME_MANIFEST_FILES[name],
      commands: {
        start: commands.start ?? `${interpreter} ${manifest.entrypoint}`,
        health: commands.health ?? null,
      },
    };
  }

  /** Reports which declared environment variables the caller can satisfy. */
  checkEnvironment(
    variables: readonly EnvironmentVariableSpec[],
    provided: ProvidedEnvironment | undefined,
  ): EnvironmentReport {
    const available = new Set(providedNames(provided));

    const required = variables.filter((entry) => entry.required).map((entry) => entry.name);
    const optional = variables.filter((entry) => !entry.required).map((entry) => entry.name);
    const secrets = variables.filter((entry) => entry.secret).map((entry) => entry.name);

    // A declared default makes a variable satisfiable without the caller
    // supplying it, so it is not counted as missing.
    const missing = variables
      .filter((entry) => entry.required && entry.default === undefined && !available.has(entry.name))
      .map((entry) => entry.name);

    return {
      variables: [...variables],
      required,
      optional,
      secrets,
      provided: [...available],
      missing,
      satisfied: missing.length === 0,
    };
  }

  /**
   * Validates an unpublished `agent.json` and returns the normalized object.
   * This is the pre-flight a CLI runs before `norien publish`.
   */
  async inspect(
    rawManifest: unknown,
    options: { environment?: ProvidedEnvironment; slug?: string } = {},
  ): Promise<NormalizedAgent> {
    if (rawManifest === null || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
      throw new AppError('MANIFEST_INVALID', 'The manifest must be a JSON object.', {
        details: [{ field: 'manifest', message: 'Expected an object.' }],
      });
    }

    const manifest = parseOrThrow(agentManifestSchema, rawManifest, {
      code: 'MANIFEST_INVALID',
      message: 'The agent manifest is invalid.',
    });

    return this.build({
      slug: options.slug ?? slugify(manifest.name),
      manifest,
      provided: options.environment,
    });
  }

  /** Normalized view of an agent already in the registry. */
  async describe(
    agent: AgentRow,
    options: { environment?: ProvidedEnvironment } = {},
  ): Promise<NormalizedAgent> {
    return this.build({
      slug: agent.slug,
      manifest: {
        name: agent.name,
        version: agent.latestVersion,
        description: agent.description,
        ...(agent.runtime ? { runtime: agent.runtime } : {}),
        entrypoint: agent.entrypoint ?? '',
        tools: agent.requiredTools,
        permissions: agent.permissions,
        environment: agent.environmentVariables,
        commands: agent.commands,
      },
      provided: options.environment,
      knownAgent: agent,
    });
  }

  /** Single normalisation path shared by `inspect` and `describe`. */
  private async build(params: {
    slug: string;
    manifest: ParsedManifest | ManifestLike;
    provided: ProvidedEnvironment | undefined;
    knownAgent?: AgentRow;
  }): Promise<NormalizedAgent> {
    const { slug, manifest, provided } = params;
    const diagnostics: Diagnostic[] = [];

    const version = parseVersion(manifest.version);
    const runtime = this.detectRuntime({
      runtime: manifest.runtime,
      entrypoint: manifest.entrypoint,
      commands: normaliseCommands(manifest.commands as never),
    });

    if (runtime.source === 'inferred') {
      diagnostics.push({
        level: 'warning',
        code: 'RUNTIME_INFERRED',
        field: 'runtime',
        message: `Runtime was inferred as '${runtime.name}' from the entrypoint. Declare it explicitly in agent.json.`,
      });
    }

    if (!runtime.commands.health) {
      diagnostics.push({
        level: 'warning',
        code: 'NO_HEALTH_COMMAND',
        field: 'commands.health',
        message: 'No health command declared. Supervisors will not be able to probe this agent.',
      });
    }

    const environmentVariables = normaliseEnvironmentVariables(manifest.environment as never);
    const environment = this.checkEnvironment(environmentVariables, provided);
    const dependencies = await this.tools.resolve(manifest.tools ?? []);
    const versionCheck = await this.checkVersion(slug, version, params.knownAgent);

    for (const missing of dependencies.missing) {
      diagnostics.push({
        level: 'error',
        code: 'DEPENDENCY_MISSING',
        field: 'tools',
        message: `Required tool '${missing}' is not published in this registry.`,
      });
    }

    for (const missing of environment.missing) {
      diagnostics.push({
        level: 'error',
        code: 'ENVIRONMENT_MISSING',
        field: 'environment',
        message: `Required environment variable '${missing}' is not set.`,
      });
    }

    if (versionCheck.action === 'conflict' && versionCheck.conflict_reason) {
      diagnostics.push({
        level: 'error',
        code: 'VERSION_CONFLICT',
        field: 'version',
        message: versionCheck.conflict_reason,
      });
    }

    const canonicalManifest: AgentManifest = {
      name: manifest.name,
      version,
      description: manifest.description,
      runtime: runtime.name,
      entrypoint: runtime.entrypoint,
      tools: unique(manifest.tools ?? []),
      permissions: unique(manifest.permissions ?? []),
      environment: environmentVariables,
      commands: runtime.commands.health
        ? { start: runtime.commands.start, health: runtime.commands.health }
        : { start: runtime.commands.start },
    };

    return {
      slug,
      name: manifest.name,
      version,
      description: manifest.description,
      runtime,
      permissions: canonicalManifest.permissions,
      dependencies,
      environment,
      version_check: versionCheck,
      install: {
        command: renderInstallCommand(slug, version),
        api_endpoint: defaultApiEndpoint(slug),
      },
      manifest: canonicalManifest,
      ready: dependencies.satisfied && environment.satisfied,
      diagnostics,
    };
  }

  /**
   * Reports what publishing this version would do, so a CLI can warn before
   * uploading rather than after a 409.
   */
  private async checkVersion(
    slug: string,
    version: string,
    knownAgent?: AgentRow,
  ): Promise<VersionReport> {
    const agent = knownAgent ?? (await this.agents.findBySlug(slug));

    if (!agent) {
      return {
        requested: version,
        latest_published: null,
        action: 'create',
        conflict_reason: null,
        acceptable: true,
      };
    }

    const published = await this.agentVersions.listVersionStrings(agent.id);
    const latest = highestVersion(published);

    // Describing an already-published agent is not a publish attempt, so the
    // version it is already at must not be reported as a conflict.
    if (knownAgent && published.includes(version)) {
      return {
        requested: version,
        latest_published: latest,
        action: 'new_version',
        conflict_reason: null,
        acceptable: true,
      };
    }

    if (published.includes(version)) {
      return {
        requested: version,
        latest_published: latest,
        action: 'conflict',
        conflict_reason: `Version ${version} has already been published. Versions are immutable.`,
        acceptable: false,
      };
    }

    if (latest && compareVersions(version, latest) < 0) {
      return {
        requested: version,
        latest_published: latest,
        action: 'conflict',
        conflict_reason: `Version ${version} is lower than the current latest version ${latest}.`,
        acceptable: false,
      };
    }

    return {
      requested: version,
      latest_published: latest,
      action: 'new_version',
      conflict_reason: null,
      acceptable: true,
    };
  }
}

/** Minimal shape `build` needs, satisfied by both parsed and stored manifests. */
interface ManifestLike {
  name: string;
  version: string;
  description: string;
  runtime?: string | undefined;
  entrypoint: string;
  tools?: string[] | undefined;
  permissions?: string[] | undefined;
  environment?: unknown;
  commands?: unknown;
}
