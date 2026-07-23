import type { Executor } from '../db/client.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { AgentVersionRepository } from '../repositories/agent-version.repository.js';
import { InstallationRepository } from '../repositories/installation.repository.js';
import { SearchRepository } from '../repositories/search.repository.js';
import { ToolRepository } from '../repositories/tool.repository.js';
import { ToolVersionRepository } from '../repositories/tool-version.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { RuntimeService } from './runtime.service.js';
import { ToolResolverService } from './tool-resolver.service.js';

/**
 * Repositories bound to one executor.
 *
 * Services build a bundle from either the pool or an open transaction, which
 * is how a multi-table write (agent + version + dependency edges) stays atomic
 * without any repository knowing that transactions exist.
 */
export interface Repositories {
  users: UserRepository;
  agents: AgentRepository;
  agentVersions: AgentVersionRepository;
  tools: ToolRepository;
  toolVersions: ToolVersionRepository;
  installations: InstallationRepository;
  search: SearchRepository;

  /**
   * Stateless domain services that read through these same repositories.
   * Bundling them here means a caller inside a transaction gets versions bound
   * to that transaction for free, rather than each service re-deriving them.
   */
  toolResolver: ToolResolverService;
  runtime: RuntimeService;
}

export function createRepositories(executor: Executor): Repositories {
  const users = new UserRepository(executor);
  const agents = new AgentRepository(executor);
  const agentVersions = new AgentVersionRepository(executor);
  const tools = new ToolRepository(executor);
  const toolVersions = new ToolVersionRepository(executor);
  const installations = new InstallationRepository(executor);
  const search = new SearchRepository(executor);

  const toolResolver = new ToolResolverService(tools);
  const runtime = new RuntimeService(toolResolver, agents, agentVersions);

  return {
    users,
    agents,
    agentVersions,
    tools,
    toolVersions,
    installations,
    search,
    toolResolver,
    runtime,
  };
}
