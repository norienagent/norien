import { AppError } from '../core/errors.js';
import { events } from '../core/events.js';
import { type Page, buildPage, resolvePageRequest } from '../core/pagination.js';
import { type Principal, assertCanMutate, canRead, requireUser } from '../core/principal.js';
import type { Database, Executor } from '../db/client.js';
import type { AgentRow, EnvironmentVariableSpec } from '../db/schema/agents.js';
import { type Repositories, createRepositories } from './repositories.js';
import { ManifestService } from './manifest.service.js';
import type { NormalizedAgent, RuntimeDescriptor } from './runtime.service.js';
import { assertVersionIncreases, parseVersion, resolveVersionRange, versionSortKey } from '../utils/semver.js';
import { resolveSlug } from '../utils/slug.js';
import { serializeAgent, serializeAgentVersion } from '../utils/serializers.js';
import type { CreateAgentInput, ListAgentsQuery, UpdateAgentInput } from '../validation/agent.schema.js';
import type { ParsedManifest } from '../validation/manifest.schema.js';
import { unique } from '../validation/manifest.schema.js';

export type AgentResponse = ReturnType<typeof serializeAgent>;
export type AgentVersionResponse = ReturnType<typeof serializeAgentVersion>;

/** The fields a publish request resolves to, whatever form it arrived in. */
interface ResolvedAgentInput {
  slug: string;
  name: string;
  description: string;
  version: string;
  requiredTools: string[];
  permissions: string[];
  environment: EnvironmentVariableSpec[];
  runtime: RuntimeDescriptor;
  manifest: ParsedManifest | null;
}

export class AgentService {
  constructor(private readonly db: Database) {}

  private repos(executor: Executor = this.db): Repositories {
    return createRepositories(executor);
  }

  /**
   * Builds the manifest/runtime services bound to a given executor, so a
   * publish inside a transaction validates against the same snapshot it writes.
   */
  private manifestService(repos: Repositories): ManifestService {
    return new ManifestService(repos.toolResolver, repos.runtime);
  }

  // --- Reads --------------------------------------------------------------

  /**
   * `GET /agents/:slug/runtime` -- the normalized object.
   *
   * Parses the manifest, detects the runtime, resolves tool dependencies, and
   * reports which environment variables are satisfied, without executing
   * anything. `provided` lets a caller ask "could I run this here?".
   */
  async describeRuntime(
    slug: string,
    principal: Principal,
    options: { environment?: readonly string[] | Record<string, string> } = {},
  ): Promise<NormalizedAgent> {
    const agent = await this.loadReadable(slug, principal);
    const repos = this.repos();

    return repos.runtime.describe(agent, {
      ...(options.environment ? { environment: options.environment } : {}),
    });
  }

  async list(query: ListAgentsQuery, principal: Principal): Promise<Page<AgentResponse>> {
    const page = resolvePageRequest(query);
    const { rows, total } = await this.repos().agents.list(
      {
        search: query.q,
        tags: query.tag,
        author: query.author,
        requiresTool: query.tool,
        runtime: query.runtime,
        visibility: query.visibility,
        viewerId: principal.userId,
        sort: query.sort,
        order: query.order,
      },
      page,
    );

    return buildPage(rows.map(serializeAgent), total, page);
  }

  async getBySlug(slug: string, principal: Principal): Promise<AgentResponse> {
    return serializeAgent(await this.loadReadable(slug, principal));
  }

  /**
   * Returns the agent as of a specific version. The head row supplies
   * presentation metadata; the version row supplies the immutable payload, so
   * a pinned install sees exactly what was published.
   */
  async getBySlugAtVersion(
    slug: string,
    range: string | undefined,
    principal: Principal,
  ): Promise<AgentResponse> {
    const agent = await this.loadReadable(slug, principal);
    const repos = this.repos();

    if (!range || range === 'latest') return serializeAgent(agent);

    const available = await repos.agentVersions.listVersionStrings(agent.id);
    const resolved = resolveVersionRange(range, available);

    if (!resolved) {
      throw AppError.notFound(`Version matching '${range}' for agent`, slug);
    }

    const version = await repos.agentVersions.findByVersion(agent.id, resolved);
    if (!version) throw AppError.notFound('Agent version', `${slug}@${resolved}`);

    return serializeAgent({
      ...agent,
      latestVersion: version.version,
      description: version.description,
      readme: version.readme ?? agent.readme,
      permissions: version.permissions,
      requiredTools: version.requiredTools,
      environmentVariables: version.environmentVariables,
      entrypoint: version.entrypoint,
      runtime: version.runtime,
      commands: version.commands,
      apiEndpoint: version.apiEndpoint ?? agent.apiEndpoint,
      manifest: version.manifest,
    });
  }

  async listVersions(
    slug: string,
    query: { limit?: number | undefined; offset?: number | undefined },
    principal: Principal,
  ): Promise<Page<AgentVersionResponse>> {
    const agent = await this.loadReadable(slug, principal);
    const page = resolvePageRequest(query);
    const { rows, total } = await this.repos().agentVersions.list(agent.id, page);

    return buildPage(rows.map(serializeAgentVersion), total, page);
  }

  // --- Writes -------------------------------------------------------------

  /**
   * `POST /agents`. Creates a brand-new agent; an existing slug is a conflict.
   * Use `publish` to add a version to an agent that already exists.
   */
  async create(input: CreateAgentInput, principal: Principal): Promise<AgentResponse> {
    return this.publish(input, principal, { allowExisting: false });
  }

  /**
   * `POST /publish`. Creates the agent on first publish and appends an
   * immutable version on every subsequent one.
   */
  async publish(
    input: CreateAgentInput,
    principal: Principal,
    options: { allowExisting?: boolean } = {},
  ): Promise<AgentResponse> {
    const actor = requireUser(principal);
    const allowExisting = options.allowExisting ?? true;

    return this.db.transaction(async (tx) => {
      const repos = this.repos(tx);
      const manifests = this.manifestService(repos);
      const resolved = this.resolveInput(input, manifests);

      // Validated inside the transaction so a tool deleted mid-publish cannot
      // slip through between the check and the write.
      const dependencies = await manifests.resolveDependencies(resolved.requiredTools);
      const dependencyIds = new Map(
        dependencies.resolved.map((tool) => [tool.slug, tool.id] as const),
      );

      const user = await repos.users.ensureByHandle(actor.handle);
      const existing = await repos.agents.findBySlug(resolved.slug);

      if (existing && !allowExisting) {
        throw AppError.slugTaken('agent', resolved.slug);
      }

      if (!existing && (await repos.agents.slugExists(resolved.slug))) {
        // The slug belongs to a soft-deleted agent; it stays reserved so that
        // previously published references can never be silently repointed.
        throw AppError.slugTaken('agent', resolved.slug);
      }

      const manifest = manifests.buildCanonicalManifest({
        manifest: resolved.manifest,
        name: resolved.name,
        version: resolved.version,
        description: resolved.description,
        requiredTools: resolved.requiredTools,
        permissions: resolved.permissions,
        environment: resolved.environment,
        runtime: resolved.runtime,
      });

      let agent: AgentRow;

      if (existing) {
        assertCanMutate(principal, {
          ownerId: existing.authorId,
          kind: 'agent',
          slug: existing.slug,
        });
        assertVersionIncreases(resolved.version, existing.latestVersion);

        agent = await repos.agents.update(existing.id, {
          name: resolved.name,
          description: resolved.description,
          latestVersion: resolved.version,
          permissions: resolved.permissions,
          requiredTools: resolved.requiredTools,
          environmentVariables: resolved.environment,
          entrypoint: resolved.runtime.entrypoint,
          runtime: resolved.runtime.name,
          commands: manifest.commands,
          manifest,
          ...(input.tags !== undefined ? { tags: unique(input.tags) } : {}),
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
          ...(input.readme !== undefined ? { readme: input.readme } : {}),
          ...(input.install_command !== undefined ? { installCommand: input.install_command } : {}),
          ...(input.api_endpoint !== undefined ? { apiEndpoint: input.api_endpoint } : {}),
          ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        });
      } else {
        agent = await repos.agents.insert({
          slug: resolved.slug,
          name: resolved.name,
          description: resolved.description,
          latestVersion: resolved.version,
          authorId: user.id,
          authorHandle: user.handle,
          tags: unique(input.tags ?? []),
          icon: input.icon ?? null,
          readme: input.readme ?? null,
          permissions: resolved.permissions,
          requiredTools: resolved.requiredTools,
          environmentVariables: resolved.environment,
          entrypoint: resolved.runtime.entrypoint,
          runtime: resolved.runtime.name,
          commands: manifest.commands,
          installCommand: input.install_command ?? null,
          apiEndpoint: input.api_endpoint ?? null,
          visibility: input.visibility,
          manifest,
        });
      }

      await repos.agentVersions.insert({
        agentId: agent.id,
        version: resolved.version,
        versionSortKey: versionSortKey(resolved.version),
        description: resolved.description,
        readme: input.readme ?? agent.readme,
        manifest,
        permissions: resolved.permissions,
        requiredTools: resolved.requiredTools,
        environmentVariables: resolved.environment,
        entrypoint: resolved.runtime.entrypoint,
        runtime: resolved.runtime.name,
        commands: manifest.commands,
        apiEndpoint: input.api_endpoint ?? null,
        publishedById: user.id,
      });

      await repos.agents.replaceToolDependencies(
        agent.id,
        resolved.requiredTools.map((slug) => ({
          toolSlug: slug,
          toolId: dependencyIds.get(slug) ?? null,
        })),
      );

      events.emit({
        type: 'agent.published',
        agentId: agent.id,
        slug: agent.slug,
        version: resolved.version,
        actorId: user.id,
      });

      return serializeAgent(agent);
    });
  }

  /** `PATCH /agents/:slug`. Metadata only -- published versions are immutable. */
  async update(
    slug: string,
    input: UpdateAgentInput,
    principal: Principal,
  ): Promise<AgentResponse> {
    const repos = this.repos();
    const existing = await repos.agents.findBySlug(slug);
    if (!existing) throw AppError.notFound('Agent', slug);

    assertCanMutate(principal, { ownerId: existing.authorId, kind: 'agent', slug });

    const updated = await repos.agents.update(existing.id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.tags !== undefined ? { tags: unique(input.tags) } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.readme !== undefined ? { readme: input.readme } : {}),
      ...(input.install_command !== undefined ? { installCommand: input.install_command } : {}),
      ...(input.api_endpoint !== undefined ? { apiEndpoint: input.api_endpoint } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    });

    events.emit({
      type: 'agent.updated',
      agentId: updated.id,
      slug: updated.slug,
      actorId: principal.userId,
    });

    return serializeAgent(updated);
  }

  /**
   * `DELETE /agents/:slug`. Soft delete: the agent leaves the catalogue but the
   * slug stays reserved and existing installations keep resolving.
   */
  async remove(slug: string, principal: Principal): Promise<void> {
    const repos = this.repos();
    const existing = await repos.agents.findBySlug(slug);
    if (!existing) throw AppError.notFound('Agent', slug);

    assertCanMutate(principal, { ownerId: existing.authorId, kind: 'agent', slug });

    await repos.agents.softDelete(existing.id);

    events.emit({
      type: 'agent.deleted',
      agentId: existing.id,
      slug: existing.slug,
      actorId: principal.userId,
    });
  }

  // --- Internals ----------------------------------------------------------

  /** Loads an agent, translating invisible private rows into a 404. */
  private async loadReadable(slug: string, principal: Principal): Promise<AgentRow> {
    const agent = await this.repos().agents.findBySlug(slug);
    if (!agent) throw AppError.notFound('Agent', slug);

    // A private agent must be indistinguishable from a missing one, otherwise
    // the endpoint leaks which slugs are taken.
    if (!canRead(principal, { ownerId: agent.authorId, visibility: agent.visibility })) {
      throw AppError.notFound('Agent', slug);
    }

    return agent;
  }

  /**
   * Reconciles the two accepted publish shapes -- a manifest, or explicit
   * top-level fields -- into one internal representation. Explicit fields win
   * so a caller can override presentation metadata without editing the
   * manifest.
   */
  private resolveInput(input: CreateAgentInput, manifests: ManifestService): ResolvedAgentInput {
    const manifest = input.manifest ? manifests.validate(input.manifest) : null;

    const name = input.name ?? manifest?.name;
    const description = input.description ?? manifest?.description;
    const rawVersion = input.version ?? manifest?.version;

    const entrypoint = input.entrypoint ?? manifest?.entrypoint;

    const missing = [
      name === undefined ? 'name' : null,
      description === undefined ? 'description' : null,
      rawVersion === undefined ? 'version' : null,
      // An agent the platform cannot describe is not publishable.
      entrypoint === undefined || entrypoint === '' ? 'entrypoint' : null,
    ].filter((field): field is string => field !== null);

    if (missing.length > 0) {
      throw AppError.validation(
        `Missing required field(s): ${missing.join(', ')}. Supply them directly or in a manifest.`,
        missing.map((field) => ({ field, message: 'Required.' })),
      );
    }

    const environmentSource = input.environment_variables ?? manifest?.environment;

    return {
      slug: resolveSlug(input.slug, name as string),
      name: name as string,
      description: description as string,
      version: parseVersion(rawVersion as string),
      requiredTools: unique(input.required_tools ?? manifest?.tools ?? []),
      permissions: unique(input.permissions ?? manifest?.permissions ?? []),
      environment: manifests.normaliseEnvironment(environmentSource),
      runtime: manifests.detectRuntime({
        runtime: input.runtime ?? manifest?.runtime,
        entrypoint: entrypoint as string,
        commands: manifests.normaliseCommands(input.commands ?? manifest?.commands),
      }),
      manifest,
    };
  }
}
