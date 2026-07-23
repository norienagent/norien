import type { Database } from '../db/client.js';
import { AgentService } from './agent.service.js';
import { InstallationService } from './installation.service.js';
import { PublishService } from './publish.service.js';
import { RuntimeService } from './runtime.service.js';
import { SearchService } from './search.service.js';
import { ToolService } from './tool.service.js';
import { createRepositories } from './repositories.js';

/**
 * The application's service container.
 *
 * Routes receive this rather than constructing services themselves, which is
 * what lets a test (or a future CLI/worker process) build the same object graph
 * against a different database with no route changes.
 */
export interface Services {
  agents: AgentService;
  tools: ToolService;
  installations: InstallationService;
  search: SearchService;
  publish: PublishService;
  /** Runtime layer: understands an agent without executing it. */
  runtime: RuntimeService;
}

export function createServices(db: Database): Services {
  return {
    agents: new AgentService(db),
    tools: new ToolService(db),
    installations: new InstallationService(db),
    search: new SearchService(db),
    publish: new PublishService(db),
    runtime: createRepositories(db).runtime,
  };
}

export {
  AgentService,
  ToolService,
  InstallationService,
  SearchService,
  PublishService,
  RuntimeService,
};
