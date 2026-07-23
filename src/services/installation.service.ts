import { AppError } from '../core/errors.js';
import { events } from '../core/events.js';
import { type Page, buildPage, resolvePageRequest } from '../core/pagination.js';
import { type Principal, canRead, requireUser } from '../core/principal.js';
import type { Database, Executor } from '../db/client.js';
import type { NormalizedAgent } from './runtime.service.js';
import { type Repositories, createRepositories } from './repositories.js';
import { resolveVersionRange } from '../utils/semver.js';
import { serializeAgent, serializeInstallation } from '../utils/serializers.js';
import type { InstallRequestInput } from '../validation/install.schema.js';

export type InstallationResponse = ReturnType<typeof serializeInstallation>;

/**
 * Everything a CLI needs to install and start an agent, in one round trip:
 * the install command, the manifest, resolved tool metadata, the detected
 * runtime, and which environment variables still need values.
 */
export interface InstallResult {
  installation: InstallationResponse;
  agent: ReturnType<typeof serializeAgent>;
  install_command: string;
  manifest: NormalizedAgent['manifest'];
  runtime: NormalizedAgent['runtime'];
  dependencies: NormalizedAgent['dependencies'];
  environment: NormalizedAgent['environment'];
  permissions: string[];
  ready: boolean;
  diagnostics: NormalizedAgent['diagnostics'];
}

export class InstallationService {
  constructor(private readonly db: Database) {}

  private repos(executor: Executor = this.db): Repositories {
    return createRepositories(executor);
  }

  /**
   * `POST /install`.
   *
   * A version *range* is resolved against what is actually published and the
   * concrete result is stored, so an installation always names a real
   * immutable version rather than a moving target.
   */
  async install(input: InstallRequestInput, principal: Principal): Promise<InstallResult> {
    const actor = requireUser(principal);

    return this.db.transaction(async (tx) => {
      const repos = this.repos(tx);

      const agent = await repos.agents.findBySlug(input.agent);
      if (!agent) throw AppError.notFound('Agent', input.agent);

      if (!canRead(principal, { ownerId: agent.authorId, visibility: agent.visibility })) {
        throw AppError.notFound('Agent', input.agent);
      }

      const available = await repos.agentVersions.listVersionStrings(agent.id);
      const version = resolveVersionRange(input.version, available);

      if (!version) {
        throw AppError.notFound(
          `Version matching '${input.version ?? 'latest'}' for agent`,
          input.agent,
        );
      }

      const user = await repos.users.ensureByHandle(actor.handle);

      const installation = await repos.installations.upsert({
        userId: user.id,
        agentId: agent.id,
        installedVersion: version,
      });

      // Described at the resolved version, not at the catalogue head, so the
      // manifest and dependencies match exactly what was installed.
      const versionRow = await repos.agentVersions.findByVersion(agent.id, version);
      const installedAgent: typeof agent = versionRow
        ? {
            ...agent,
            latestVersion: versionRow.version,
            description: versionRow.description,
            permissions: versionRow.permissions,
            requiredTools: versionRow.requiredTools,
            environmentVariables: versionRow.environmentVariables,
            entrypoint: versionRow.entrypoint,
            runtime: versionRow.runtime,
            commands: versionRow.commands,
            manifest: versionRow.manifest,
          }
        : { ...agent, latestVersion: version };

      const normalized = await repos.runtime.describe(installedAgent, {
        ...(input.environment ? { environment: input.environment } : {}),
      });

      const withNames = await repos.installations.findByIdWithNames(installation.id);
      if (!withNames) throw AppError.internal('Installation vanished after creation.');

      events.emit({
        type: 'agent.installed',
        agentId: agent.id,
        slug: agent.slug,
        version,
        userId: user.id,
      });

      return {
        installation: serializeInstallation(withNames),
        agent: serializeAgent(installedAgent),
        install_command: normalized.install.command,
        manifest: normalized.manifest,
        runtime: normalized.runtime,
        dependencies: normalized.dependencies,
        environment: normalized.environment,
        permissions: normalized.permissions,
        ready: normalized.ready,
        diagnostics: normalized.diagnostics,
      };
    });
  }

  /** Tombstones the active installation. Idempotent by design. */
  async uninstall(agentSlug: string, principal: Principal): Promise<void> {
    const actor = requireUser(principal);
    const repos = this.repos();

    const agent = await repos.agents.findBySlug(agentSlug);
    if (!agent) throw AppError.notFound('Agent', agentSlug);

    // No user row means nothing was ever installed under this handle.
    const user = await repos.users.findByHandle(actor.handle);
    if (!user) throw AppError.notFound('Installation for agent', agentSlug);

    const removed = await repos.installations.deactivate(user.id, agent.id);
    if (!removed) throw AppError.notFound('Installation for agent', agentSlug);

    events.emit({
      type: 'agent.uninstalled',
      agentId: agent.id,
      slug: agent.slug,
      userId: user.id,
    });
  }

  async listForPrincipal(
    query: { limit?: number | undefined; offset?: number | undefined; include_uninstalled: boolean },
    principal: Principal,
  ): Promise<Page<InstallationResponse>> {
    const actor = requireUser(principal);
    const page = resolvePageRequest(query);
    const repos = this.repos();

    const user = await repos.users.findByHandle(actor.handle);
    if (!user) return buildPage([], 0, page);

    const { rows, total } = await repos.installations.listForUser(
      user.id,
      { includeUninstalled: query.include_uninstalled },
      page,
    );

    return buildPage(rows.map(serializeInstallation), total, page);
  }
}
