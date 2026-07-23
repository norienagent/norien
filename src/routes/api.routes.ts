import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { AppError } from '../core/errors.js';
import { providerCache } from '../core/cache.js';
import { aggregatorService } from '../services/external/aggregator.js';
import { errorResponseSchema } from '../validation/common.js';
import {
  addressParams,
  chainStatusSchema,
  contractSchema,
  envelope,
  listProjectsQuery,
  listTokensQuery,
  paged,
  projectParams,
  projectSchema,
  providersResponseSchema,
  searchQuery,
  searchResultSchema,
  tokenParams,
  tokenQuery,
  tokenSchema,
  trendingQuery,
  walletQuery,
  walletSchema,
} from '../validation/api.schema.js';

/**
 * The unified data API.
 *
 * Every route composes external providers through the aggregator and returns a
 * normalized shape. Consumers — frontend, CLI, SDK — talk only to these
 * endpoints; nothing outside `services/external` reaches a third party.
 *
 * Responses carry `sources` and `degraded`, so a partial answer is visibly
 * partial instead of quietly incomplete. A provider outage degrades a response;
 * it does not fail the request.
 */
export const dataApiRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/tokens',
    {
      schema: {
        tags: ['Market Data'],
        summary: 'List tokens',
        description:
          'Ranked token listing from the primary market-data provider. Defaults to the native chain; pass `chainId` for another.',
        querystring: listTokensQuery,
        response: { 200: envelope(paged(tokenSchema)), 422: errorResponseSchema },
      },
    },
    async (request) =>
      aggregatorService.listTokens({
        ...(request.query.chainId !== undefined ? { chainId: request.query.chainId } : {}),
        limit: request.query.limit,
        offset: request.query.offset,
        ranking: request.query.sort,
        ...(request.query.q ? { query: request.query.q } : {}),
      }),
  );

  app.get(
    '/api/trending',
    {
      schema: {
        tags: ['Market Data'],
        summary: 'Trending tokens',
        description: 'Tokens ranked by 24h trending score.',
        querystring: trendingQuery,
        response: { 200: envelope(paged(tokenSchema)), 422: errorResponseSchema },
      },
    },
    async (request) => aggregatorService.getTrending(request.query.chainId, request.query.limit),
  );

  app.get(
    '/api/token/:address',
    {
      schema: {
        tags: ['Market Data'],
        summary: 'Token detail',
        description:
          'Market data, metadata, and on-chain identity for one token, merged into a single normalized record.',
        params: tokenParams,
        querystring: tokenQuery,
        response: {
          200: envelope(tokenSchema),
          404: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const result = await aggregatorService.getToken(
        request.params.address,
        request.query.chainId,
      );

      // A null payload with healthy sources genuinely means "no such token".
      if (result.data === null) {
        throw AppError.notFound('Token', request.params.address);
      }

      return { ...result, data: result.data };
    },
  );

  app.get(
    '/api/projects',
    {
      schema: {
        tags: ['Projects'],
        summary: 'List projects',
        description: 'DeFi protocols ranked by TVL, filterable by chain, category, and name.',
        querystring: listProjectsQuery,
        response: { 200: envelope(paged(projectSchema)), 422: errorResponseSchema },
      },
    },
    async (request) =>
      aggregatorService.listProjects({
        ...(request.query.chain ? { chain: request.query.chain } : {}),
        ...(request.query.category ? { category: request.query.category } : {}),
        ...(request.query.q ? { query: request.query.q } : {}),
        limit: request.query.limit,
        offset: request.query.offset,
      }),
  );

  app.get(
    '/api/project/:slug',
    {
      schema: {
        tags: ['Projects'],
        summary: 'Project detail',
        description:
          'One protocol with its per-chain TVL breakdown, plus repository health when it links a GitHub project.',
        params: projectParams,
        response: {
          200: envelope(projectSchema),
          404: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const result = await aggregatorService.getProject(request.params.slug);

      if (result.data === null) {
        throw AppError.notFound('Project', request.params.slug);
      }

      return { ...result, data: result.data };
    },
  );

  app.get(
    '/api/contracts/:address',
    {
      schema: {
        tags: ['Chain'],
        summary: 'Contract detail',
        description:
          'Verified source, ABI, creator, and token identity for a contract, combining the explorer with a direct node read.',
        params: addressParams,
        response: {
          200: envelope(contractSchema),
          404: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const result = await aggregatorService.getContract(request.params.address);

      if (result.data === null) {
        throw AppError.notFound('Contract', request.params.address);
      }

      return { ...result, data: result.data };
    },
  );

  app.get(
    '/api/wallets/:address',
    {
      schema: {
        tags: ['Chain'],
        summary: 'Wallet detail',
        description:
          'Balance, nonce, recent transactions, and token transfers for an address on the native chain.',
        params: addressParams,
        querystring: walletQuery,
        response: { 200: envelope(walletSchema), 422: errorResponseSchema },
      },
    },
    async (request) => aggregatorService.getWallet(request.params.address, request.query.limit),
  );

  app.get(
    '/api/search',
    {
      schema: {
        tags: ['Market Data'],
        summary: 'Unified search',
        description:
          'Searches tokens and projects together. An input that looks like an address resolves directly to that address.',
        querystring: searchQuery,
        response: { 200: envelope(paged(searchResultSchema)), 422: errorResponseSchema },
      },
    },
    async (request) => aggregatorService.search(request.query.q, request.query.limit),
  );

  app.get(
    '/api/chain',
    {
      schema: {
        tags: ['Chain'],
        summary: 'Chain status',
        description: 'Current block height and gas price, read directly from the node.',
        response: { 200: envelope(chainStatusSchema), 503: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await aggregatorService.getChainStatus();

      if (result.data === null) {
        return reply.status(503).send({
          error: {
            code: 'INTERNAL',
            message: 'The chain node is unreachable.',
            request_id: request.id,
          },
        });
      }

      return { ...result, data: result.data };
    },
  );

  app.get(
    '/api/providers',
    {
      schema: {
        tags: ['System'],
        summary: 'Provider configuration and reachability',
        description:
          'Which external providers are configured, whether each is reachable right now, and live cache statistics.',
        response: { 200: providersResponseSchema },
      },
    },
    async () => ({
      data: await aggregatorService.describeProviders(),
      cache: providerCache.stats,
    }),
  );
};
