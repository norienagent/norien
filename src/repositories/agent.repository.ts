import { arrayContains, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import {
  type AgentRow,
  type NewAgentRow,
  agentToolDependencies,
  agents,
} from '../db/schema/agents.js';
import { users } from '../db/schema/users.js';
import type { PageRequest } from '../core/pagination.js';
import { alive, allOf, countExpression, textSearchCondition, visibleTo } from './shared.js';

export interface AgentListFilters {
  search?: string | undefined;
  tags?: string[] | undefined;
  author?: string | undefined;
  /** Restrict to agents declaring this tool slug as a dependency. */
  requiresTool?: string | undefined;
  runtime?: string | undefined;
  visibility?: 'public' | 'private' | undefined;
  /** Who is asking. Drives private-row visibility. */
  viewerId: string | null;
  sort: 'created_at' | 'updated_at' | 'name' | 'slug';
  order: 'asc' | 'desc';
}

const SORT_COLUMNS = {
  created_at: agents.createdAt,
  updated_at: agents.updatedAt,
  name: agents.name,
  slug: agents.slug,
} as const;

export class AgentRepository {
  constructor(private readonly db: Executor) {}

  /**
   * Looks up by slug regardless of visibility. Access control is a service
   * concern -- the repository must return the row so the service can tell
   * "not found" apart from "forbidden".
   */
  async findBySlug(slug: string): Promise<AgentRow | null> {
    const [row] = await this.db
      .select()
      .from(agents)
      .where(allOf(eq(agents.slug, slug), alive(agents.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findById(id: string): Promise<AgentRow | null> {
    const [row] = await this.db
      .select()
      .from(agents)
      .where(allOf(eq(agents.id, id), alive(agents.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  /** Includes tombstoned rows: a deleted slug stays reserved. */
  async slugExists(slug: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.slug, slug))
      .limit(1);

    return row !== undefined;
  }

  private buildWhere(filters: AgentListFilters): SQL | undefined {
    const conditions: (SQL | undefined)[] = [
      alive(agents.deletedAt),
      visibleTo(agents.visibility, agents.authorId, filters.viewerId),
    ];

    if (filters.search) {
      conditions.push(textSearchCondition(agents.searchVector, filters.search));
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push(arrayContains(agents.tags, filters.tags));
    }

    if (filters.author) {
      conditions.push(eq(agents.authorHandle, filters.author));
    }

    if (filters.runtime) {
      conditions.push(eq(agents.runtime, filters.runtime));
    }

    if (filters.visibility) {
      conditions.push(eq(agents.visibility, filters.visibility));
    }

    if (filters.requiresTool) {
      // A subquery instead of a join keeps the result set free of duplicates
      // and lets the count query reuse the same predicate unchanged.
      conditions.push(
        inArray(
          agents.id,
          this.db
            .select({ id: agentToolDependencies.agentId })
            .from(agentToolDependencies)
            .where(eq(agentToolDependencies.toolSlug, filters.requiresTool)),
        ),
      );
    }

    return allOf(...conditions);
  }

  async list(
    filters: AgentListFilters,
    page: PageRequest,
  ): Promise<{ rows: AgentRow[]; total: number }> {
    const where = this.buildWhere(filters);
    const direction = filters.order === 'asc' ? asc : desc;
    const sortColumn = SORT_COLUMNS[filters.sort];

    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(agents)
        .where(where)
        // `id` breaks ties so pagination is stable across pages.
        .orderBy(direction(sortColumn), desc(agents.id))
        .limit(page.limit)
        .offset(page.offset),
      this.db.select({ value: countExpression }).from(agents).where(where),
    ]);

    return { rows, total: totals[0]?.value ?? 0 };
  }

  async insert(values: NewAgentRow): Promise<AgentRow> {
    const [row] = await this.db.insert(agents).values(values).returning();
    if (!row) throw new Error('Failed to insert agent.');
    return row;
  }

  async update(id: string, patch: Partial<NewAgentRow>): Promise<AgentRow> {
    const [row] = await this.db
      .update(agents)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning();

    if (!row) throw new Error(`Agent ${id} disappeared during update.`);
    return row;
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(agents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(agents.id, id));
  }

  /**
   * Replaces the queryable dependency projection for an agent. Called whenever
   * `required_tools` changes so the edge table never drifts from the array.
   */
  async replaceToolDependencies(
    agentId: string,
    dependencies: { toolSlug: string; toolId: string | null }[],
  ): Promise<void> {
    await this.db.delete(agentToolDependencies).where(eq(agentToolDependencies.agentId, agentId));

    if (dependencies.length === 0) return;

    await this.db.insert(agentToolDependencies).values(
      dependencies.map((dependency) => ({
        agentId,
        toolSlug: dependency.toolSlug,
        toolId: dependency.toolId,
      })),
    );
  }

  /**
   * Back-fills the tool id on dependency edges that were recorded before the
   * tool existed. Called when a tool is first published so the projection
   * becomes fully resolved without rewriting the agents themselves.
   */
  async linkDependenciesToTool(toolSlug: string, toolId: string): Promise<void> {
    await this.db
      .update(agentToolDependencies)
      .set({ toolId })
      .where(
        allOf(
          eq(agentToolDependencies.toolSlug, toolSlug),
          isNull(agentToolDependencies.toolId),
        ),
      );
  }

  /** Resolves author handles to ids in one round trip for list responses. */
  async findAuthorIdByHandle(handle: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, handle))
      .limit(1);

    return row?.id ?? null;
  }

  /** Number of live agents. Used by `GET /health` and future stats. */
  async count(): Promise<number> {
    const [row] = await this.db
      .select({ value: countExpression })
      .from(agents)
      .where(allOf(alive(agents.deletedAt), eq(agents.visibility, 'public')));

    return row?.value ?? 0;
  }

  /** Agents that depend on a given tool. Powers dependency-impact checks. */
  async findDependents(toolSlug: string, limit = 50): Promise<{ slug: string }[]> {
    return this.db
      .select({ slug: agents.slug })
      .from(agentToolDependencies)
      .innerJoin(agents, eq(agents.id, agentToolDependencies.agentId))
      .where(allOf(eq(agentToolDependencies.toolSlug, toolSlug), alive(agents.deletedAt)))
      .orderBy(sql`${agents.slug} asc`)
      .limit(limit);
  }
}
