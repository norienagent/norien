import { fileURLToPath } from 'node:url';

import { closeDb, getDb } from './client.js';
import { AGENT_FIXTURES, TOOL_FIXTURES } from './fixtures.js';
import { applyMigrations } from './migrate.js';
import { isAppError } from '../core/errors.js';
import type { Principal } from '../core/principal.js';
import { UserRepository } from '../repositories/user.repository.js';
import { createServices } from '../services/index.js';
import { createAgentSchema } from '../validation/agent.schema.js';
import { parseOrThrow } from '../validation/parse.js';
import { createToolSchema } from '../validation/tool.schema.js';

export interface SeedReport {
  tools: number;
  agents: number;
  installations: number;
  skipped: string[];
}

/**
 * Resolves a principal the same way the auth middleware does: the user row is
 * materialised on demand and its real id is carried, so ownership checks on
 * second and later publishes behave exactly as they do over HTTP.
 */
async function publisher(handle: string): Promise<Principal> {
  const users = new UserRepository(await getDb());
  const user = await users.ensureByHandle(handle);

  return {
    kind: 'user',
    userId: user.id,
    handle: user.handle,
    organisationId: null,
    scopes: ['agents:write', 'tools:write', 'install'],
  };
}

function describe(error: unknown): string {
  return isAppError(error) ? `${error.code}: ${error.message}` : String(error);
}

/**
 * Idempotent. Re-running skips anything already published rather than failing,
 * so it is safe to call on every boot in development.
 */
export async function seed(options: { log?: (line: string) => void } = {}): Promise<SeedReport> {
  const log = options.log ?? (() => {});
  const services = createServices(await getDb());
  const report: SeedReport = { tools: 0, agents: 0, installations: 0, skipped: [] };

  const registry = await publisher('norien');

  // Tools first: an agent cannot be published until its dependencies exist.
  for (const tool of TOOL_FIXTURES) {
    try {
      await services.tools.publish(parseOrThrow(createToolSchema, tool), registry);
      report.tools += 1;
      log(`tool   ${tool.slug}@${tool.version}`);
    } catch (error) {
      report.skipped.push(`tool:${tool.slug}`);
      log(`tool   ${tool.slug} skipped (${describe(error)})`);
    }
  }

  for (const agent of AGENT_FIXTURES) {
    const slug = String(agent.body.slug);
    try {
      const input = parseOrThrow(createAgentSchema, agent.body);
      const result = await services.agents.publish(input, await publisher(agent.author));
      report.agents += 1;
      log(`agent  ${result.slug}@${result.version} (${result.runtime})`);
    } catch (error) {
      report.skipped.push(`agent:${slug}`);
      log(`agent  ${slug} skipped (${describe(error)})`);
    }
  }

  // One installation so `GET /installations` is not empty on a fresh clone.
  try {
    await services.installations.install({ agent: 'research-agent' }, await publisher('demo'));
    report.installations += 1;
    log('install demo -> research-agent');
  } catch (error) {
    report.skipped.push('install:research-agent');
    log(`install research-agent skipped (${describe(error)})`);
  }

  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  applyMigrations()
    .then(() => seed({ log: (line) => process.stdout.write(`${line}\n`) }))
    .then((report) => {
      process.stdout.write(
        `\nseeded ${report.tools} tools, ${report.agents} agent versions, ${report.installations} installation(s)\n`,
      );
      return closeDb();
    })
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      process.stderr.write(`seed failed: ${String(error)}\n`);
      process.exit(1);
    });
}
