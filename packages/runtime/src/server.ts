import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import { isRuntimeError } from './errors.js';
import type { RuntimeManager } from './manager.js';
import type { LogRecord } from './types.js';

/**
 * Runtime HTTP API.
 *
 * The supervisor's control plane. The CLI drives the runtime exclusively
 * through these endpoints, which is what makes a remote runtime a change of
 * base URL rather than a change of code.
 *
 * This is deliberately a *separate* service from the registry: the registry is
 * a shared catalogue and must never execute user code, while this process runs
 * on the machine that owns the agents.
 */

const slugParam = z.object({ agent: z.string().min(1).max(64) });

const runBodySchema = z.object({
  agent: z.string().min(1).max(64),
  command: z.string().max(1000).optional(),
  env: z.record(z.string(), z.string()).optional(),
  grant: z.array(z.string().max(120)).max(50).optional(),
  grant_all: z.boolean().optional(),
  restart_policy: z.enum(['no', 'on-failure', 'always']).optional(),
  offline: z.boolean().optional(),
});

const stopBodySchema = z.object({
  agent: z.string().min(1).max(64),
  timeout_ms: z.coerce.number().int().min(0).max(120_000).optional(),
  force: z.boolean().optional(),
});

const logsQuerySchema = z.object({
  agent: z.string().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(5000).default(200),
  follow: z.coerce.boolean().default(false),
  stream: z.enum(['stdout', 'stderr', 'system']).optional(),
  /** Read durable history from disk instead of the in-memory buffer. */
  history: z.coerce.boolean().default(false),
});

export interface RuntimeServerOptions {
  manager: RuntimeManager;
  logger?: boolean;
}

export async function buildRuntimeServer(
  options: RuntimeServerOptions,
): Promise<FastifyInstance> {
  const { manager } = options;

  const app = Fastify({
    logger: options.logger === true,
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true });

  // One error envelope, matching the registry's shape so clients need a single
  // error path across both services.
  app.setErrorHandler((raw: unknown, request, reply) => {
    const error = raw as Error & { statusCode?: number };

    if (isRuntimeError(error)) {
      void reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          request_id: request.id,
        },
      });
      return;
    }

    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
    request.log?.error?.({ err: error }, 'runtime request failed');

    void reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'INTERNAL' : 'BAD_REQUEST',
        message: error.message,
        request_id: request.id,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} does not exist.`,
        request_id: request.id,
      },
    });
  });

  // --- Inspection ---------------------------------------------------------

  app.get('/health', async () => ({
    status: 'ok',
    workspace: manager.workspace,
    uptime_seconds: Math.round(process.uptime()),
    pid: process.pid,
  }));

  app.get('/runtime', async () => {
    const instances = await manager.list();
    return { data: instances, meta: { total: instances.length } };
  });

  /**
   * A dedicated summary endpoint: `norien status` needs counts by state, and
   * deriving them client-side would mean every client reimplements the same
   * bucketing.
   */
  app.get('/runtime/status', async () => {
    const instances = await manager.list();

    const summary = {
      running: 0,
      stopped: 0,
      failed: 0,
      restarting: 0,
      starting: 0,
      stopping: 0,
      installing: 0,
    };

    for (const instance of instances) summary[instance.status] += 1;

    return {
      data: instances.map((instance) => ({
        agent: instance.slug,
        version: instance.version,
        status: instance.status,
        health: instance.health,
        pid: instance.pid,
        uptime_seconds: instance.uptimeSeconds,
        restarts: instance.restarts,
        runtime: instance.manifest.runtime,
        exit: instance.exit,
      })),
      summary,
      meta: { total: instances.length },
    };
  });

  app.get(
    '/runtime/logs',
    { schema: { querystring: logsQuerySchema } },
    async (request, reply) => {
      const { agent, limit, follow, stream, history } = request.query;
      // Confirms the agent exists before streaming, so a typo 404s rather than
      // hanging on an empty stream forever.
      const instance = await manager.describe(agent);

      if (!follow) {
        const records = history
          ? await manager.logs.history(instance.directory, { limit })
          : manager.logs.tail(agent, limit, stream ? { stream } : {});

        return { data: records, meta: { agent, count: records.length } };
      }

      // Server-sent events: a plain HTTP stream any client can consume without
      // a WebSocket dependency.
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });

      const send = (record: LogRecord) => {
        if (stream && record.stream !== stream) return;
        reply.raw.write(`data: ${JSON.stringify(record)}\n\n`);
      };

      for (const record of manager.logs.tail(agent, limit, stream ? { stream } : {})) send(record);

      const subscription = manager.logs.follow(agent, send);
      // Keeps proxies from closing an idle stream.
      const keepAlive = setInterval(() => reply.raw.write(': keep-alive\n\n'), 15_000);
      keepAlive.unref?.();

      request.raw.on('close', () => {
        clearInterval(keepAlive);
        subscription.close();
      });

      return reply;
    },
  );

  app.get('/runtime/:agent', { schema: { params: slugParam } }, async (request) => {
    return manager.describe(request.params.agent);
  });

  // --- Control ------------------------------------------------------------

  app.post('/runtime/run', { schema: { body: runBodySchema } }, async (request, reply) => {
    const body = request.body;

    const instance = await manager.start(body.agent, {
      ...(body.command !== undefined ? { command: body.command } : {}),
      ...(body.env !== undefined ? { env: body.env } : {}),
      ...(body.grant !== undefined ? { grant: body.grant } : {}),
      ...(body.grant_all !== undefined ? { grantAll: body.grant_all } : {}),
      ...(body.restart_policy !== undefined ? { restartPolicy: body.restart_policy } : {}),
      ...(body.offline !== undefined ? { offline: body.offline } : {}),
    });

    return reply.status(201).send(instance);
  });

  app.post('/runtime/stop', { schema: { body: stopBodySchema } }, async (request) => {
    const body = request.body;

    return manager.stop(body.agent, {
      ...(body.timeout_ms !== undefined ? { timeoutMs: body.timeout_ms } : {}),
      ...(body.force !== undefined ? { force: body.force } : {}),
    });
  });

  app.post('/runtime/restart', { schema: { body: runBodySchema } }, async (request) => {
    const body = request.body;

    return manager.restart(body.agent, {
      ...(body.command !== undefined ? { command: body.command } : {}),
      ...(body.env !== undefined ? { env: body.env } : {}),
      ...(body.grant !== undefined ? { grant: body.grant } : {}),
      ...(body.grant_all !== undefined ? { grantAll: body.grant_all } : {}),
      ...(body.restart_policy !== undefined ? { restartPolicy: body.restart_policy } : {}),
      ...(body.offline !== undefined ? { offline: body.offline } : {}),
    });
  });

  await app.ready();
  return app;
}
