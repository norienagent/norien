import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import { type ApiKeyRow, type NewApiKeyRow, apiKeys } from '../db/schema/api-keys.js';

/**
 * Storage for personal API keys. Keys are looked up by hash on every
 * authenticated request, so that path is a single indexed equality; everything
 * else is scoped to the owning handle.
 */
export class ApiKeyRepository {
  constructor(private readonly db: Executor) {}

  /** The active (non-revoked) key for a hash, or null. The auth hot path. */
  async findActiveByHash(keyHash: string): Promise<ApiKeyRow | null> {
    const [row] = await this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
      .limit(1);

    return row ?? null;
  }

  /** A handle's keys, newest first, including revoked ones (shown struck out). */
  async listByHandle(handle: string): Promise<ApiKeyRow[]> {
    return this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.handle, handle))
      .orderBy(desc(apiKeys.createdAt));
  }

  async countActiveByHandle(handle: string): Promise<number> {
    const rows = await this.db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.handle, handle), isNull(apiKeys.revokedAt)));
    return rows.length;
  }

  async insert(values: NewApiKeyRow): Promise<ApiKeyRow> {
    const [row] = await this.db.insert(apiKeys).values(values).returning();
    if (!row) throw new Error('Failed to insert API key.');
    return row;
  }

  /** Revokes a key, but only if it belongs to the given handle. */
  async revoke(id: string, handle: string): Promise<boolean> {
    const rows = await this.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.handle, handle), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id });

    return rows.length > 0;
  }

  /** Best-effort last-used stamp; never blocks or fails a request. */
  async touch(id: string): Promise<void> {
    await this.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }
}
