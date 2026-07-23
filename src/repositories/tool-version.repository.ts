import { and, desc, eq } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import type { PageRequest } from '../core/pagination.js';
import { type NewToolVersionRow, type ToolVersionRow, toolVersions } from '../db/schema/tools.js';
import { countExpression } from './shared.js';

/** Immutable published tool versions. Mirrors `AgentVersionRepository`. */
export class ToolVersionRepository {
  constructor(private readonly db: Executor) {}

  async insert(values: NewToolVersionRow): Promise<ToolVersionRow> {
    const [row] = await this.db.insert(toolVersions).values(values).returning();
    if (!row) throw new Error('Failed to insert tool version.');
    return row;
  }

  async findByVersion(toolId: string, version: string): Promise<ToolVersionRow | null> {
    const [row] = await this.db
      .select()
      .from(toolVersions)
      .where(and(eq(toolVersions.toolId, toolId), eq(toolVersions.version, version)))
      .limit(1);

    return row ?? null;
  }

  async list(
    toolId: string,
    page: PageRequest,
  ): Promise<{ rows: ToolVersionRow[]; total: number }> {
    const where = eq(toolVersions.toolId, toolId);

    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(toolVersions)
        .where(where)
        .orderBy(desc(toolVersions.versionSortKey))
        .limit(page.limit)
        .offset(page.offset),
      this.db.select({ value: countExpression }).from(toolVersions).where(where),
    ]);

    return { rows, total: totals[0]?.value ?? 0 };
  }

  async listVersionStrings(toolId: string): Promise<string[]> {
    const rows = await this.db
      .select({ version: toolVersions.version })
      .from(toolVersions)
      .where(eq(toolVersions.toolId, toolId))
      .orderBy(desc(toolVersions.versionSortKey));

    return rows.map((row) => row.version);
  }
}
