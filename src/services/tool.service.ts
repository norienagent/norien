import { AppError, type ErrorDetail } from '../core/errors.js';
import { events } from '../core/events.js';
import { type Page, buildPage, resolvePageRequest } from '../core/pagination.js';
import { type Principal, assertCanMutate, canRead, requireUser } from '../core/principal.js';
import type { Database, Executor } from '../db/client.js';
import type { ToolEnvironmentVariable, ToolRow } from '../db/schema/tools.js';
import { type Repositories, createRepositories } from './repositories.js';
import { assertVersionIncreases, parseVersion, resolveVersionRange, versionSortKey } from '../utils/semver.js';
import { resolveSlug } from '../utils/slug.js';
import { renderToolInstallCommand, serializeTool, serializeToolVersion } from '../utils/serializers.js';
import { normaliseEnvironmentVariables, unique } from '../validation/manifest.schema.js';
import type {
  CreateToolInput,
  ListToolsQuery,
  SearchToolsQuery,
  UpdateToolInput,
} from '../validation/tool.schema.js';

export type ToolResponse = ReturnType<typeof serializeTool>;
export type ToolVersionResponse = ReturnType<typeof serializeToolVersion>;

export interface ToolInstallResult {
  tool: ToolResponse;
  resolved_version: string;
  dependencies: ToolResponse[];
  install_command: string;
}

export class ToolService {
  constructor(private readonly db: Database) {}

  private repos(executor: Executor = this.db): Repositories {
    return createRepositories(executor);
  }

  async list(query: ListToolsQuery, principal: Principal): Promise<Page<ToolResponse>> {
    const page = resolvePageRequest(query);
    const { rows, total } = await this.repos().tools.list(
      {
        search: query.q,
        category: query.category,
        tags: query.tag,
        author: query.author,
        visibility: query.visibility,
        viewerId: principal.userId,
        sort: query.sort,
        order: query.order,
      },
      page,
    );

    return buildPage(rows.map(serializeTool), total, page);
  }

  async getBySlug(slug: string, principal: Principal): Promise<ToolResponse> {
    return serializeTool(await this.loadReadable(slug, principal));
  }

  /**
   * `GET /tools/search`. Ranked full-text search restricted to the tool
   * catalogue -- the marketplace's own search surface, distinct from the
   * cross-catalogue `/search`.
   */
  async search(query: SearchToolsQuery, principal: Principal): Promise<Page<ToolResponse>> {
    const page = resolvePageRequest(query);
    const { rows, total } = await this.repos().tools.list(
      {
        search: query.q,
        category: query.category,
        runtime: query.runtime,
        tags: query.tag,
        author: query.author,
        viewerId: principal.userId,
        sort: 'created_at',
        order: 'desc',
      },
      page,
    );

    return buildPage(rows.map(serializeTool), total, page);
  }

  /**
   * `POST /tools/install`.
   *
   * Resolves a version or range to a concrete published version and returns the
   * full manifest plus its dependency tools, so a client can materialise the
   * tool locally in one round trip. Deliberately resolve-only: install counts
   * and usage metrics are a later phase, so nothing is recorded here.
   */
  async install(
    slug: string,
    range: string | undefined,
    principal: Principal,
  ): Promise<ToolInstallResult> {
    const tool = await this.loadReadable(slug, principal);
    const repos = this.repos();

    const available = await repos.toolVersions.listVersionStrings(tool.id);
    const resolved = resolveVersionRange(range, available) ?? tool.latestVersion;

    // The head row carries the latest manifest; a pinned older version is
    // served from its immutable version row so an install is reproducible.
    let serialized = serializeTool(tool);
    if (resolved !== tool.latestVersion) {
      const versionRow = await repos.toolVersions.findByVersion(tool.id, resolved);
      if (!versionRow) throw AppError.notFound('Tool version', `${slug}@${resolved}`);
      serialized = {
        ...serialized,
        version: versionRow.version,
        runtime: versionRow.runtime,
        entrypoint: versionRow.entrypoint,
        input_schema: versionRow.inputSchema,
        output_schema: versionRow.outputSchema,
        authentication: versionRow.authentication,
        environment: versionRow.environmentVariables,
        permissions: versionRow.permissions,
        dependencies: versionRow.dependencies,
        install_command: renderToolInstallCommand(tool.slug, versionRow.version),
      };
    }

    // Dependency tools are resolved and returned too, so installing one tool
    // brings everything it needs in a single call.
    const dependencyRows = await repos.tools.findBySlugs(serialized.dependencies);
    const dependencies = dependencyRows
      .filter((row) => canRead(principal, { ownerId: row.authorId, visibility: row.visibility }))
      .map(serializeTool);

    return {
      tool: serialized,
      resolved_version: resolved,
      dependencies,
      install_command: renderToolInstallCommand(tool.slug, resolved),
    };
  }

  async listVersions(
    slug: string,
    query: { limit?: number | undefined; offset?: number | undefined },
    principal: Principal,
  ): Promise<Page<ToolVersionResponse>> {
    const tool = await this.loadReadable(slug, principal);
    const page = resolvePageRequest(query);
    const { rows, total } = await this.repos().toolVersions.list(tool.id, page);

    return buildPage(rows.map(serializeToolVersion), total, page);
  }

  /** `POST /tools`. Rejects an existing slug; `publish` appends versions. */
  async create(input: CreateToolInput, principal: Principal): Promise<ToolResponse> {
    return this.publish(input, principal, { allowExisting: false });
  }

  async publish(
    input: CreateToolInput,
    principal: Principal,
    options: { allowExisting?: boolean } = {},
  ): Promise<ToolResponse> {
    const actor = requireUser(principal);
    const allowExisting = options.allowExisting ?? true;

    const slug = resolveSlug(input.slug, input.name);
    const version = parseVersion(input.version);
    const authentication = input.authentication ?? { type: 'none' as const };
    const environment: ToolEnvironmentVariable[] = normaliseEnvironmentVariables(input.environment);
    const permissions = unique(input.permissions ?? []);
    const dependencies = unique(input.dependencies ?? []);
    const runtime = input.runtime ?? null;
    const entrypoint = input.entrypoint ?? null;

    return this.db.transaction(async (tx) => {
      const repos = this.repos(tx);
      const user = await repos.users.ensureByHandle(actor.handle);

      // A tool that depends on tools nobody published is unusable, so this is a
      // hard failure at publish time. A tool may not depend on itself.
      await this.assertDependenciesExist(repos, slug, dependencies);

      const existing = await repos.tools.findBySlug(slug);

      if (existing && !allowExisting) {
        throw AppError.slugTaken('tool', slug);
      }

      if (!existing && (await repos.tools.slugExists(slug))) {
        throw AppError.slugTaken('tool', slug);
      }

      let tool: ToolRow;

      if (existing) {
        assertCanMutate(principal, { ownerId: existing.authorId, kind: 'tool', slug });
        assertVersionIncreases(version, existing.latestVersion);

        tool = await repos.tools.update(existing.id, {
          name: input.name,
          description: input.description,
          latestVersion: version,
          category: input.category,
          runtime,
          entrypoint,
          inputSchema: input.input_schema,
          outputSchema: input.output_schema,
          authentication,
          environmentVariables: environment,
          permissions,
          dependencies,
          license: input.license ?? existing.license,
          homepage: input.homepage ?? existing.homepage,
          repository: input.repository ?? existing.repository,
          documentation: input.documentation ?? existing.documentation,
          ...(input.tags !== undefined ? { tags: unique(input.tags) } : {}),
          ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        });
      } else {
        tool = await repos.tools.insert({
          slug,
          name: input.name,
          description: input.description,
          latestVersion: version,
          category: input.category,
          authorId: user.id,
          authorHandle: user.handle,
          tags: unique(input.tags ?? []),
          runtime,
          entrypoint,
          inputSchema: input.input_schema,
          outputSchema: input.output_schema,
          authentication,
          environmentVariables: environment,
          permissions,
          dependencies,
          license: input.license ?? null,
          homepage: input.homepage ?? null,
          repository: input.repository ?? null,
          documentation: input.documentation ?? null,
          visibility: input.visibility,
        });
      }

      await repos.toolVersions.insert({
        toolId: tool.id,
        version,
        versionSortKey: versionSortKey(version),
        description: input.description,
        runtime,
        entrypoint,
        inputSchema: input.input_schema,
        outputSchema: input.output_schema,
        authentication,
        environmentVariables: environment,
        permissions,
        dependencies,
        documentation: input.documentation ?? null,
        publishedById: user.id,
      });

      // A newly published tool adopts any agent edges that referenced its slug
      // before it existed, keeping the dependency projection fully resolved.
      if (!existing) {
        await repos.agents.linkDependenciesToTool(tool.slug, tool.id);
      }

      events.emit({
        type: 'tool.published',
        toolId: tool.id,
        slug: tool.slug,
        version,
        actorId: user.id,
      });

      return serializeTool(tool);
    });
  }

  async update(slug: string, input: UpdateToolInput, principal: Principal): Promise<ToolResponse> {
    const repos = this.repos();
    const existing = await repos.tools.findBySlug(slug);
    if (!existing) throw AppError.notFound('Tool', slug);

    assertCanMutate(principal, { ownerId: existing.authorId, kind: 'tool', slug });

    const updated = await repos.tools.update(existing.id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.tags !== undefined ? { tags: unique(input.tags) } : {}),
      ...(input.documentation !== undefined ? { documentation: input.documentation } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    });

    events.emit({
      type: 'tool.updated',
      toolId: updated.id,
      slug: updated.slug,
      actorId: principal.userId,
    });

    return serializeTool(updated);
  }

  /**
   * Soft delete, refused while agents still depend on the tool. Removing a
   * dependency out from under published agents would break every install of
   * them, so the caller is told exactly who is affected.
   */
  async remove(slug: string, principal: Principal): Promise<void> {
    const repos = this.repos();
    const existing = await repos.tools.findBySlug(slug);
    if (!existing) throw AppError.notFound('Tool', slug);

    assertCanMutate(principal, { ownerId: existing.authorId, kind: 'tool', slug });

    const dependents = await repos.agents.findDependents(slug);

    if (dependents.length > 0) {
      throw AppError.conflict(
        `Tool '${slug}' is required by ${dependents.length} agent(s) and cannot be removed.`,
        dependents.map((agent) => ({
          field: 'required_tools',
          message: `Agent '${agent.slug}' depends on this tool.`,
          agent: agent.slug,
        })),
      );
    }

    await repos.tools.softDelete(existing.id);

    events.emit({
      type: 'tool.deleted',
      toolId: existing.id,
      slug: existing.slug,
      actorId: principal.userId,
    });
  }

  private async loadReadable(slug: string, principal: Principal): Promise<ToolRow> {
    const tool = await this.repos().tools.findBySlug(slug);
    if (!tool) throw AppError.notFound('Tool', slug);

    if (!canRead(principal, { ownerId: tool.authorId, visibility: tool.visibility })) {
      throw AppError.notFound('Tool', slug);
    }

    return tool;
  }

  /** Confirms every declared dependency tool exists, reporting all misses. */
  private async assertDependenciesExist(
    repos: Repositories,
    slug: string,
    dependencies: readonly string[],
  ): Promise<void> {
    if (dependencies.length === 0) return;

    if (dependencies.includes(slug)) {
      throw AppError.validation(`A tool cannot depend on itself.`, [
        { field: 'dependencies', message: `'${slug}' lists itself as a dependency.` },
      ]);
    }

    const found = await repos.tools.findBySlugs(dependencies);
    const foundSlugs = new Set(found.map((tool) => tool.slug));
    const missing = dependencies.filter((dependency) => !foundSlugs.has(dependency));

    if (missing.length > 0) {
      const details: ErrorDetail[] = missing.map((dependency) => ({
        field: 'dependencies',
        message: `Tool '${dependency}' is not published in this registry.`,
        slug: dependency,
      }));

      throw new AppError(
        'DEPENDENCY_MISSING',
        `${missing.length} dependency tool(s) could not be resolved: ${missing.join(', ')}.`,
        { details },
      );
    }
  }
}
