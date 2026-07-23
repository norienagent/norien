import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  type ZodTypeProvider,
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import { env, isProduction, isTest } from './config/env.js';
import { events } from './core/events.js';
import { authPlugin } from './middleware/auth.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { servicesPlugin } from './middleware/services.js';
import { apiRoutes } from './routes/index.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

/**
 * Builds a fully wired application without starting it, so tests and the
 * OpenAPI exporter can use the exact same instance the server runs.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isTest
      ? false
      : {
          level: env.LOG_LEVEL,
          ...(isProduction ? {} : { transport: { target: 'pino-pretty' } }),
        },
    genReqId: () => crypto.randomUUID(),
    ajv: { customOptions: { coerceTypes: false } },
  }).withTypeProvider<ZodTypeProvider>();

  // Zod owns both request validation and response serialisation, which is what
  // keeps the OpenAPI document generated from the same schemas the code runs.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandler(app);

  await app.register(helmet, {
    // Swagger UI needs inline styles/scripts; the API itself serves only JSON.
    contentSecurityPolicy: false,
  });
  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Norien Registry API',
        description:
          'Agent registry and tool marketplace. Publish agents and reusable tools, discover them through ranked search, and install them by slug and version.',
        version: process.env.npm_package_version ?? '0.1.0',
      },
      servers: [{ url: env.PUBLIC_BASE_URL }],
      tags: [
        { name: 'Agents', description: 'Publish, discover, and manage agents.' },
        { name: 'Tools', description: 'Reusable capabilities that agents depend on.' },
        { name: 'Search', description: 'Ranked search across both catalogues.' },
        { name: 'Installations', description: 'Install and track agents.' },
        { name: 'Publishing', description: 'Unified publish endpoint for the CLI.' },
        { name: 'System', description: 'Operational endpoints.' },
      ],
      components: {
        securitySchemes: {
          // Declared now so clients and generated SDKs already model auth.
          // The principal is resolved from a development header instead.
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'authorization',
            description: 'Reserved for a later phase. Not enforced yet.',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
    // Schemas carrying a `.meta({ id })` are emitted as `$ref`s; this hoists
    // them into `components.schemas`. Without it those references dangle.
    transformObject: jsonSchemaTransformObject,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  await app.register(authPlugin);
  await app.register(servicesPlugin);
  await app.register(apiRoutes);

  // Minimal browsing console for manual testing. Deliberately unstyled and
  // unbranded -- the real interface is a later phase.
  await app.register(staticFiles, { root: PUBLIC_DIR, prefix: '/console/' });

  events.onError = (event, error) => {
    app.log.error({ err: error, event: event.type }, 'domain event handler failed');
  };

  if (!isTest) {
    events.on('*', (event) => {
      app.log.info({ event }, 'domain event');
    });
  }

  await app.ready();
  return app;
}
