import { z } from 'zod';

import { env } from '../config/env.js';

/**
 * Request validation and response shapes for the unified `/api/*` surface.
 *
 * Naming here is camelCase, matching the normalized model specified for this
 * API. The registry surface (`/agents`, `/tools`) keeps its snake_case
 * contract; the two are separate products of separate phases and neither
 * should be silently renamed under existing clients.
 */

/** A 20-byte hex address, normalised to lower case. */
export const addressParam = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a 0x-prefixed 20-byte address.')
  .transform((value) => value.toLowerCase());

export const slugParam = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Must be a URL-safe slug.');

const limitField = z.coerce.number().int().min(1).max(100).default(20);
const offsetField = z.coerce.number().int().min(0).default(0);

/** Defaults to the native chain so callers need not repeat it. */
const chainIdField = z.coerce.number().int().positive().default(env.ROBINHOOD_CHAIN_ID);

export const listTokensQuery = z.object({
  chainId: chainIdField.optional(),
  limit: limitField,
  offset: offsetField,
  q: z.string().trim().min(1).max(120).optional(),
  sort: z
    .enum(['volume24', 'liquidity', 'marketCap', 'change24', 'trendingScore24'])
    .default('volume24'),
});

export const tokenParams = z.object({ address: addressParam });
export const tokenQuery = z.object({ chainId: chainIdField });

export const trendingQuery = z.object({
  chainId: chainIdField.optional(),
  limit: limitField,
});

export const listProjectsQuery = z.object({
  chain: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  limit: limitField,
  offset: offsetField,
});

export const projectParams = z.object({ slug: slugParam });
export const addressParams = z.object({ address: addressParam });

export const walletQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const searchQuery = z.object({
  q: z.string().trim().min(1).max(120),
  limit: limitField,
});

// --- Response shapes -------------------------------------------------------

const sourceReportSchema = z.object({
  provider: z.string(),
  status: z.enum(['ok', 'unavailable', 'not_configured', 'skipped']),
  reason: z.string().optional(),
  ms: z.number().optional(),
});

/** Every `/api/*` response carries its provenance in the same envelope. */
export const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    data,
    sources: z.array(sourceReportSchema),
    degraded: z.boolean(),
  });

const chainRefSchema = z.object({ id: z.number(), name: z.string() });

const pageMetaSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});

export const paged = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), meta: pageMetaSchema });

const tokenLinksSchema = z.object({
  website: z.string().nullable(),
  twitter: z.string().nullable(),
  telegram: z.string().nullable(),
  explorer: z.string().nullable(),
});

/** The normalized Token. */
export const tokenSchema = z.object({
  address: z.string(),
  name: z.string(),
  symbol: z.string(),
  logo: z.string().nullable(),
  price: z.number().nullable(),
  marketCap: z.number().nullable(),
  liquidity: z.number().nullable(),
  holders: z.number().nullable(),
  volume24h: z.number().nullable(),
  change24h: z.number().nullable(),
  chain: chainRefSchema,
  decimals: z.number().nullable().optional(),
  totalSupply: z.number().nullable().optional(),
  circulatingSupply: z.number().nullable().optional(),
  maxSupply: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  categories: z.array(z.string()).optional(),
  links: tokenLinksSchema.optional(),
  fdv: z.number().nullable().optional(),
  txns24h: z.number().nullable().optional(),
});

const repositorySchema = z.object({
  fullName: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  stars: z.number(),
  forks: z.number(),
  openIssues: z.number(),
  watchers: z.number(),
  license: z.string().nullable(),
  defaultBranch: z.string(),
  pushedAt: z.string().nullable(),
  languages: z.array(z.object({ name: z.string(), bytes: z.number(), share: z.number() })),
  latestRelease: z
    .object({
      name: z.string().nullable(),
      tag: z.string(),
      url: z.string(),
      publishedAt: z.string().nullable(),
    })
    .nullable(),
  topContributors: z.array(
    z.object({
      login: z.string(),
      contributions: z.number(),
      avatar: z.string().nullable(),
      url: z.string(),
    }),
  ),
  recentCommits: z.array(
    z.object({
      sha: z.string(),
      message: z.string(),
      author: z.string().nullable(),
      date: z.string().nullable(),
      url: z.string(),
    }),
  ),
});

export const projectSchema = z.object({
  slug: z.string(),
  name: z.string(),
  symbol: z.string().nullable(),
  description: z.string().nullable(),
  logo: z.string().nullable(),
  category: z.string().nullable(),
  url: z.string().nullable(),
  chains: z.array(z.string()),
  tvl: z.number().nullable(),
  chainTvl: z.array(z.object({ chain: z.string(), tvl: z.number() })),
  twitter: z.string().nullable(),
  github: z.string().nullable(),
  repository: repositorySchema.nullable(),
});

export const contractSchema = z.object({
  address: z.string(),
  chain: chainRefSchema,
  isContract: z.boolean(),
  verified: z.boolean(),
  name: z.string().nullable(),
  compilerVersion: z.string().nullable(),
  optimizationEnabled: z.boolean().nullable(),
  license: z.string().nullable(),
  abi: z.array(z.unknown()).nullable(),
  sourceCode: z.string().nullable(),
  creator: z.string().nullable(),
  creationTxHash: z.string().nullable(),
  bytecodeSize: z.number(),
  balance: z.string().nullable(),
  token: z
    .object({
      name: z.string().nullable(),
      symbol: z.string().nullable(),
      decimals: z.number().nullable(),
      totalSupply: z.string().nullable(),
      holders: z.number().nullable(),
    })
    .nullable(),
});

const transactionSchema = z.object({
  hash: z.string(),
  blockNumber: z.number(),
  timestamp: z.string().nullable(),
  from: z.string(),
  to: z.string().nullable(),
  value: z.string(),
  gasUsed: z.string().nullable(),
  success: z.boolean(),
});

const tokenTransferSchema = z.object({
  hash: z.string(),
  blockNumber: z.number(),
  timestamp: z.string().nullable(),
  from: z.string(),
  to: z.string(),
  value: z.string(),
  tokenAddress: z.string(),
  tokenSymbol: z.string().nullable(),
  tokenDecimals: z.number().nullable(),
});

export const walletSchema = z.object({
  address: z.string(),
  chain: chainRefSchema,
  balance: z.string(),
  balanceFormatted: z.string(),
  nonce: z.number().nullable(),
  isContract: z.boolean(),
  transactionCount: z.number().nullable(),
  transactions: z.array(transactionSchema),
  tokenTransfers: z.array(tokenTransferSchema),
});

export const searchResultSchema = z.object({
  kind: z.enum(['token', 'project', 'address']),
  id: z.string(),
  name: z.string(),
  symbol: z.string().nullable(),
  logo: z.string().nullable(),
  chain: chainRefSchema.nullable(),
  score: z.number(),
});

export const chainStatusSchema = z.object({
  chain: chainRefSchema,
  blockNumber: z.number(),
  gasPrice: z.string(),
  gasPriceGwei: z.number(),
  nativeCurrency: z.string(),
  explorer: z.string().nullable(),
});

export const providersResponseSchema = z.object({
  data: z.array(
    z.object({
      provider: z.string(),
      configured: z.boolean(),
      reachable: z.boolean().nullable(),
      reason: z.string().optional(),
      ms: z.number().optional(),
    }),
  ),
  cache: z.object({
    hits: z.number(),
    misses: z.number(),
    staleServed: z.number(),
    sets: z.number(),
    evictions: z.number(),
    size: z.number(),
  }),
});
