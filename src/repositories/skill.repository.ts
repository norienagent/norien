import { arrayContains, asc, desc, eq } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import type { PageRequest } from '../core/pagination.js';
import { type NewSkillRow, type SkillRow, skills } from '../db/schema/skills.js';
import { alive, allOf, countExpression, textSearchCondition, visibleTo } from './shared.js';

export interface SkillListFilters {
  search?: string | undefined;
  category?: string | undefined;
  tags?: string[] | undefined;
  author?: string | undefined;
  viewerId: string | null;
  sort: 'created_at' | 'updated_at' | 'name' | 'slug';
  order: 'asc' | 'desc';
}

const SORT_COLUMNS = {
  created_at: skills.createdAt,
  updated_at: skills.updatedAt,
  name: skills.name,
  slug: skills.slug,
} as const;

/**
 * Skills are single-row (no immutable version history yet): publishing a slug
 * that already exists updates it in place. Everything else mirrors the tool
 * repository so soft-deletion and visibility rules stay identical.
 */
export class SkillRepository {
  constructor(private readonly db: Executor) {}

  async findBySlug(slug: string): Promise<SkillRow | null> {
    const [row] = await this.db
      .select()
      .from(skills)
      .where(allOf(eq(skills.slug, slug), alive(skills.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  private buildWhere(filters: SkillListFilters): SQL | undefined {
    const conditions: (SQL | undefined)[] = [
      alive(skills.deletedAt),
      visibleTo(skills.visibility, skills.authorId, filters.viewerId),
    ];
    if (filters.search) conditions.push(textSearchCondition(skills.searchVector, filters.search));
    if (filters.category) conditions.push(eq(skills.category, filters.category));
    if (filters.tags && filters.tags.length > 0) conditions.push(arrayContains(skills.tags, filters.tags));
    if (filters.author) conditions.push(eq(skills.authorHandle, filters.author));
    return allOf(...conditions);
  }

  async list(filters: SkillListFilters, page: PageRequest): Promise<{ rows: SkillRow[]; total: number }> {
    const where = this.buildWhere(filters);
    const direction = filters.order === 'asc' ? asc : desc;
    const sortColumn = SORT_COLUMNS[filters.sort];

    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(skills)
        .where(where)
        .orderBy(direction(sortColumn), desc(skills.id))
        .limit(page.limit)
        .offset(page.offset),
      this.db.select({ value: countExpression }).from(skills).where(where),
    ]);

    return { rows, total: totals[0]?.value ?? 0 };
  }

  /** Publish: insert a new skill, or update the existing one with that slug. */
  async upsertBySlug(values: NewSkillRow): Promise<SkillRow> {
    const existing = await this.findBySlug(values.slug);
    if (existing) {
      const [row] = await this.db
        .update(skills)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(skills.id, existing.id))
        .returning();
      if (!row) throw new Error(`Skill ${existing.id} disappeared during update.`);
      return row;
    }
    const [row] = await this.db.insert(skills).values(values).returning();
    if (!row) throw new Error('Failed to insert skill.');
    return row;
  }

  async count(): Promise<number> {
    const [row] = await this.db
      .select({ value: countExpression })
      .from(skills)
      .where(allOf(alive(skills.deletedAt), eq(skills.visibility, 'public')));
    return row?.value ?? 0;
  }
}
