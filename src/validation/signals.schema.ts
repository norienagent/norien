import { z } from 'zod';

/** Request + response shapes for AI Signals. */

export const signalTagSchema = z.enum([
  'momentum-up',
  'momentum-down',
  'high-activity',
  'fresh-launch',
  'thin-risky',
]);

export const signalSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  address: z.string(),
  price: z.number().nullable(),
  change24h: z.number().nullable(),
  volume24h: z.number().nullable(),
  liquidity: z.number().nullable(),
  holders: z.number().nullable(),
  ageHours: z.number().nullable(),
  activity: z.number().nullable(),
  tags: z.array(signalTagSchema),
  score: z.number(),
});

export const signalsResponseSchema = z.object({
  data: z.object({
    signals: z.array(signalSchema),
    generatedAt: z.string(),
    degraded: z.boolean(),
  }),
});
