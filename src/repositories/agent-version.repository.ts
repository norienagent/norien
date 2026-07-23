import { and, desc, eq } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import type { PageRequest } from '../core/pagination.js';
import {
  type AgentVersionRow,
  type NewAgentVersionRow,
  agentVersions,
} from '../db/schema/agents.js';
import { countExpression } from './shared.js';

/**
 * Immutable published versions. There is deliberately no `update` here -- once
 * a version exists, consumers may have pinned it.
 */
export class AgentVersionRepository {
  constructor(private readonly db: Executor) {}

  async insert(values: NewAgentVersionRow): Promise<AgentVersionRow> {
    const [row] = await this.db.insert(agentVersions).values(values).returning();
    if (!row) throw new Error('Failed to insert agent version.');
    return row;
  }

  async findByVersion(agentId: string, version: string): Promise<AgentVersionRow | null> {
    const [row] = await this.db
      .select()
      .from(agentVersions)
      .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.version, version)))
      .limit(1);

    return row ?? null;
  }

  /** Ordered newest first using the precomputed sort key. */
  async list(
    agentId: string,
    page: PageRequest,
  ): Promise<{ rows: AgentVersionRow[]; total: number }> {
    const where = eq(agentVersions.agentId, agentId);

    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(agentVersions)
        .where(where)
        .orderBy(desc(agentVersions.versionSortKey))
        .limit(page.limit)
        .offset(page.offset),
      this.db.select({ value: countExpression }).from(agentVersions).where(where),
    ]);

    return { rows, total: totals[0]?.value ?? 0 };
  }

  async listVersionStrings(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ version: agentVersions.version })
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId))
      .orderBy(desc(agentVersions.versionSortKey));

    return rows.map((row) => row.version);
  }

  async findLatest(agentId: string): Promise<AgentVersionRow | null> {
    const [row] = await this.db
      .select()
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId))
      .orderBy(desc(agentVersions.versionSortKey))
      .limit(1);

    return row ?? null;
  }
}
