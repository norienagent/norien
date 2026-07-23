import { z } from 'zod';

import { agentResponseSchema } from './agent.schema.js';
import { csvArray, paginationQuery, tagField } from './common.js';
import { toolResponseSchema } from './tool.schema.js';

/**
 * `GET /search` -- one endpoint across both catalogues.
 *
 * Results are ranked by Postgres full-text relevance, so `type=all` returns a
 * single merged, comparably-ranked list rather than two concatenated ones.
 */
export const searchQuerySchema = paginationQuery.extend({
  q: z.string().trim().min(1).max(200).describe('Search term.'),
  type: z.enum(['all', 'agent', 'tool']).default('all'),
  tag: csvArray(tagField),
  category: z.string().trim().toLowerCase().max(64).optional(),
  author: z.string().trim().max(64).optional(),
  strategy: z
    .string()
    .trim()
    .max(32)
    .optional()
    .describe('Preferred ranking strategy. Falls back when unavailable.'),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchHitSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('agent'), score: z.number(), item: agentResponseSchema }),
  z.object({ type: z.literal('tool'), score: z.number(), item: toolResponseSchema }),
]);

export const publishRequestSchema = z
  .object({
    /**
     * Publishing a tool and publishing an agent share an endpoint so a CLI has
     * one code path; the discriminant selects which catalogue is targeted.
     */
    type: z.enum(['agent', 'tool']).default('agent'),
  })
  .loose();
