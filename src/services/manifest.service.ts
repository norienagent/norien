import { AppError } from '../core/errors.js';
import type { AgentCommands, AgentManifest, EnvironmentVariableSpec } from '../db/schema/agents.js';
import { parseOrThrow } from '../validation/parse.js';
import {
  type ParsedManifest,
  agentManifestSchema,
  normaliseCommands,
  normaliseEnvironmentVariables,
} from '../validation/manifest.schema.js';
import { parseVersion } from '../utils/semver.js';
import type { RuntimeDescriptor, RuntimeService } from './runtime.service.js';
import type { ToolResolution, ToolResolverService } from './tool-resolver.service.js';

/**
 * Manifest parsing for the publish path.
 *
 * Dependency resolution and runtime detection are delegated rather than
 * reimplemented, so publishing and `POST /runtime/inspect` can never disagree
 * about whether an agent is valid.
 */
export class ManifestService {
  constructor(
    private readonly tools: ToolResolverService,
    private readonly runtime: RuntimeService,
  ) {}

  /**
   * Structural validation. Returns the manifest with defaults applied and the
   * version normalised, reporting every problem at once rather than the first.
   */
  validate(input: unknown): ParsedManifest {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new AppError('MANIFEST_INVALID', 'The manifest must be a JSON object.', {
        details: [{ field: 'manifest', message: 'Expected an object.' }],
      });
    }

    const manifest = parseOrThrow(agentManifestSchema, input, {
      code: 'MANIFEST_INVALID',
      message: 'The agent manifest is invalid.',
    });

    return { ...manifest, version: parseVersion(manifest.version) };
  }

  /** Publish-time dependency check: unsatisfiable agents are rejected. */
  async resolveDependencies(toolSlugs: readonly string[]): Promise<ToolResolution> {
    return this.tools.require(toolSlugs);
  }

  /** Resolves the runtime, inferring from the entrypoint when undeclared. */
  detectRuntime(params: {
    runtime: string | undefined;
    entrypoint: string;
    commands: AgentCommands;
  }): RuntimeDescriptor {
    return this.runtime.detectRuntime(params);
  }

  /**
   * Produces the canonical manifest stored alongside an agent, reconciling the
   * submitted manifest with any explicit top-level overrides.
   */
  buildCanonicalManifest(params: {
    manifest: ParsedManifest | null;
    name: string;
    version: string;
    description: string;
    runtime: RuntimeDescriptor;
    requiredTools: string[];
    permissions: string[];
    environment: EnvironmentVariableSpec[];
  }): AgentManifest {
    const extras = params.manifest ? stripKnownKeys(params.manifest) : {};
    const { start, health } = params.runtime.commands;

    return {
      ...extras,
      name: params.name,
      version: params.version,
      description: params.description,
      runtime: params.runtime.name,
      entrypoint: params.runtime.entrypoint,
      tools: params.requiredTools,
      permissions: params.permissions,
      environment: params.environment,
      commands: health ? { start, health } : { start },
    };
  }

  normaliseEnvironment(input: ParsedManifest['environment'] | undefined): EnvironmentVariableSpec[] {
    return normaliseEnvironmentVariables(input);
  }

  normaliseCommands(input: ParsedManifest['commands'] | undefined): AgentCommands {
    return normaliseCommands(input);
  }
}

const KNOWN_MANIFEST_KEYS = new Set([
  'name',
  'version',
  'description',
  'runtime',
  'entrypoint',
  'tools',
  'permissions',
  'environment',
  'commands',
]);

/** Keeps publisher-defined extension fields while dropping the known ones. */
function stripKnownKeys(manifest: ParsedManifest): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(manifest).filter(([key]) => !KNOWN_MANIFEST_KEYS.has(key)),
  );
}
