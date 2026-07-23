import { arrayContains, asc, desc, eq, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import type { PageRequest } from '../core/pagination.js';
import { type NewToolRow, type ToolRow, tools } from '../db/schema/tools.js';
import { alive, allOf, countExpression, textSearchCondition, visibleTo } from './shared.js';

export interface ToolListFilters {
  search?: string | undefined;
  category?: string | undefined;
  runtime?: string | undefined;
  tags?: string[] | undefined;
  author?: string | undefined;
  visibility?: 'public' | 'private' | undefined;
  viewerId: string | null;
  sort: 'created_at' | 'updated_at' | 'name' | 'slug';
  order: 'asc' | 'desc';
}

const SORT_COLUMNS = {
  created_at: tools.createdAt,
  updated_at: tools.updatedAt,
  name: tools.name,
  slug: tools.slug,
} as const;

export class ToolRepository {
  constructor(private readonly db: Executor) {}

  async findBySlug(slug: string): Promise<ToolRow | null> {
    const [row] = await this.db
      .select()
      .from(tools)
      .where(allOf(eq(tools.slug, slug), alive(tools.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findById(id: string): Promise<ToolRow | null> {
    const [row] = await this.db
      .select()
      .from(tools)
      .where(allOf(eq(tools.id, id), alive(tools.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  /**
   * Bulk existence check backing tool-dependency validation. One query for the
   * whole dependency list keeps publishing O(1) round trips.
   */
  async findBySlugs(slugs: readonly string[]): Promise<ToolRow[]> {
    if (slugs.length === 0) return [];

    return this.db
      .select()
      .from(tools)
      .where(allOf(inArray(tools.slug, [...slugs]), alive(tools.deletedAt)));
  }

  async slugExists(slug: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: tools.id })
      .from(tools)
      .where(eq(tools.slug, slug))
      .limit(1);

    return row !== undefined;
  }

  private buildWhere(filters: ToolListFilters): SQL | undefined {
    const conditions: (SQL | undefined)[] = [
      alive(tools.deletedAt),
      visibleTo(tools.visibility, tools.authorId, filters.viewerId),
    ];

    if (filters.search) {
      conditions.push(textSearchCondition(tools.searchVector, filters.search));
    }

    if (filters.category) {
      conditions.push(eq(tools.category, filters.category));
    }

    if (filters.runtime) {
      conditions.push(eq(tools.runtime, filters.runtime));
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push(arrayContains(tools.tags, filters.tags));
    }

    if (filters.author) {
      conditions.push(eq(tools.authorHandle, filters.author));
    }

    if (filters.visibility) {
      conditions.push(eq(tools.visibility, filters.visibility));
    }

    return allOf(...conditions);
  }

  async list(
    filters: ToolListFilters,
    page: PageRequest,
  ): Promise<{ rows: ToolRow[]; total: number }> {
    const where = this.buildWhere(filters);
    const direction = filters.order === 'asc' ? asc : desc;
    const sortColumn = SORT_COLUMNS[filters.sort];

    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(tools)
        .where(where)
        .orderBy(direction(sortColumn), desc(tools.id))
        .limit(page.limit)
        .offset(page.offset),
      this.db.select({ value: countExpression }).from(tools).where(where),
    ]);

    return { rows, total: totals[0]?.value ?? 0 };
  }

  async insert(values: NewToolRow): Promise<ToolRow> {
    const [row] = await this.db.insert(tools).values(values).returning();
    if (!row) throw new Error('Failed to insert tool.');
    return row;
  }

  async update(id: string, patch: Partial<NewToolRow>): Promise<ToolRow> {
    const [row] = await this.db
      .update(tools)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tools.id, id))
      .returning();

    if (!row) throw new Error(`Tool ${id} disappeared during update.`);
    return row;
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(tools)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(tools.id, id));
  }

  async count(): Promise<number> {
    const [row] = await this.db
      .select({ value: countExpression })
      .from(tools)
      .where(allOf(alive(tools.deletedAt), eq(tools.visibility, 'public')));

    return row?.value ?? 0;
  }
}
