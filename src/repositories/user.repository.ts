import { eq } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import { type NewUserRow, type UserRow, users } from '../db/schema/users.js';
import { alive, allOf } from './shared.js';

/**
 * There is no signup flow yet, so publishers are materialised on first use from
 * the acting handle. When real authentication lands, only the *caller* of
 * `ensureByHandle` changes -- the storage shape is already correct.
 */
export class UserRepository {
  constructor(private readonly db: Executor) {}

  async findByHandle(handle: string): Promise<UserRow | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(allOf(eq(users.handle, handle), alive(users.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  async insert(values: NewUserRow): Promise<UserRow> {
    const [row] = await this.db.insert(users).values(values).returning();
    if (!row) throw new Error('Failed to insert user.');
    return row;
  }

  /**
   * Idempotent upsert on handle. `onConflictDoUpdate` rather than a
   * read-then-insert so concurrent first-time publishes cannot race.
   */
  async ensureByHandle(handle: string): Promise<UserRow> {
    const [row] = await this.db
      .insert(users)
      .values({ handle, displayName: handle })
      .onConflictDoUpdate({
        target: users.handle,
        set: { updatedAt: new Date() },
      })
      .returning();

    if (!row) throw new Error(`Failed to resolve user '${handle}'.`);
    return row;
  }
}
