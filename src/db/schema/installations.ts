import { sql } from 'drizzle-orm';
import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { createdAt, primaryId } from './_shared.js';
import { agents } from './agents.js';
import { users } from './users.js';

/**
 * A user's installation of an agent at a specific version.
 *
 * Uninstalling tombstones the row rather than deleting it, so install history
 * (and the download counts a later phase will derive from it) stays intact.
 * The partial unique index below permits exactly one *active* installation per
 * user/agent pair while allowing any number of historical ones.
 */
export const installations = pgTable(
  'installations',
  {
    id: primaryId(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),

    installedVersion: varchar('installed_version', { length: 64 }).notNull(),

    installedAt: createdAt(),
    uninstalledAt: timestamp('uninstalled_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('installations_active_unique')
      .on(table.userId, table.agentId)
      .where(sql`${table.uninstalledAt} is null`),
    index('installations_user_idx').on(table.userId),
    index('installations_agent_idx').on(table.agentId),
    index('installations_installed_at_idx').on(table.installedAt),
  ],
);

export type InstallationRow = typeof installations.$inferSelect;
export type NewInstallationRow = typeof installations.$inferInsert;
