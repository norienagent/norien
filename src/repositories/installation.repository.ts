import { and, desc, eq, isNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import type { PageRequest } from '../core/pagination.js';
import { agents } from '../db/schema/agents.js';
import { type InstallationRow, installations } from '../db/schema/installations.js';
import { users } from '../db/schema/users.js';
import { allOf, countExpression } from './shared.js';

/** An installation joined with the identifiers a client actually displays. */
export interface InstallationWithNames extends InstallationRow {
  agentSlug: string;
  userHandle: string;
}

const SELECTION = {
  id: installations.id,
  userId: installations.userId,
  agentId: installations.agentId,
  installedVersion: installations.installedVersion,
  installedAt: installations.installedAt,
  uninstalledAt: installations.uninstalledAt,
  agentSlug: agents.slug,
  userHandle: users.handle,
};

export class InstallationRepository {
  constructor(private readonly db: Executor) {}

  async findActive(userId: string, agentId: string): Promise<InstallationRow | null> {
    const [row] = await this.db
      .select()
      .from(installations)
      .where(
        and(
          eq(installations.userId, userId),
          eq(installations.agentId, agentId),
          isNull(installations.uninstalledAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  /**
   * Installs, or moves an existing active installation to a new version.
   *
   * Upserting on the partial unique index makes repeated `POST /install` calls
   * idempotent, which is what a CLI retry needs.
   */
  async upsert(values: {
    userId: string;
    agentId: string;
    installedVersion: string;
  }): Promise<InstallationRow> {
    const existing = await this.findActive(values.userId, values.agentId);

    if (existing) {
      const [row] = await this.db
        .update(installations)
        .set({ installedVersion: values.installedVersion, installedAt: new Date() })
        .where(eq(installations.id, existing.id))
        .returning();

      if (!row) throw new Error('Failed to update installation.');
      return row;
    }

    const [row] = await this.db.insert(installations).values(values).returning();
    if (!row) throw new Error('Failed to create installation.');
    return row;
  }

  /** Tombstones rather than deletes, preserving install history. */
  async deactivate(userId: string, agentId: string): Promise<InstallationRow | null> {
    const [row] = await this.db
      .update(installations)
      .set({ uninstalledAt: new Date() })
      .where(
        and(
          eq(installations.userId, userId),
          eq(installations.agentId, agentId),
          isNull(installations.uninstalledAt),
        ),
      )
      .returning();

    return row ?? null;
  }

  async listForUser(
    userId: string,
    options: { includeUninstalled: boolean },
    page: PageRequest,
  ): Promise<{ rows: InstallationWithNames[]; total: number }> {
    const conditions: (SQL | undefined)[] = [eq(installations.userId, userId)];
    if (!options.includeUninstalled) {
      conditions.push(isNull(installations.uninstalledAt));
    }
    const where = allOf(...conditions);

    const [rows, totals] = await Promise.all([
      this.db
        .select(SELECTION)
        .from(installations)
        .innerJoin(agents, eq(agents.id, installations.agentId))
        .innerJoin(users, eq(users.id, installations.userId))
        .where(where)
        .orderBy(desc(installations.installedAt), desc(installations.id))
        .limit(page.limit)
        .offset(page.offset),
      this.db.select({ value: countExpression }).from(installations).where(where),
    ]);

    return { rows, total: totals[0]?.value ?? 0 };
  }

  /** Active installations of an agent. The basis of future download counts. */
  async countForAgent(agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: countExpression })
      .from(installations)
      .where(and(eq(installations.agentId, agentId), isNull(installations.uninstalledAt)));

    return row?.value ?? 0;
  }

  async findByIdWithNames(id: string): Promise<InstallationWithNames | null> {
    const [row] = await this.db
      .select(SELECTION)
      .from(installations)
      .innerJoin(agents, eq(agents.id, installations.agentId))
      .innerJoin(users, eq(users.id, installations.userId))
      .where(eq(installations.id, id))
      .limit(1);

    return row ?? null;
  }
}
