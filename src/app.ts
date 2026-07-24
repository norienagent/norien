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
    theme: {
      title: 'Norien API — Reference',
      // Reskin Swagger UI in the Norien design system so the reference is
      // consistent with the site, app, and docs.
      css: [
        {
          filename: 'norien.css',
          content: `
            body, .swagger-ui { background:#F6F2EA; font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif; }
            .swagger-ui .topbar { background:#2E261F; padding:10px 0; }
            .swagger-ui .topbar .download-url-wrapper { display:none; }
            .swagger-ui .topbar-wrapper img { display:none; }
            .swagger-ui .topbar-wrapper::before { content:'norien · API'; color:#F6F2EA; font-weight:600; font-size:1.05rem; letter-spacing:-.01em; }
            .swagger-ui .info .title { color:#2E261F; }
            .swagger-ui .info a, .swagger-ui a { color:#7A5A3A; }
            .swagger-ui .scheme-container { background:transparent; box-shadow:none; border-bottom:1px solid #DDD2C2; }
            .swagger-ui .opblock-tag { color:#2E261F; border-bottom:1px solid #DDD2C2; }
            .swagger-ui .opblock { border-radius:12px; box-shadow:none; border:1px solid #DDD2C2; background:#fff; }
            .swagger-ui .opblock .opblock-summary { border-radius:12px; }
            .swagger-ui .opblock.opblock-get .opblock-summary-method { background:#3f6b47; }
            .swagger-ui .opblock.opblock-post .opblock-summary-method { background:#7A5A3A; }
            .swagger-ui .opblock.opblock-delete .opblock-summary-method { background:#a3442f; }
            .swagger-ui .btn.authorize, .swagger-ui .btn.execute { background:#7A5A3A; border-color:#7A5A3A; color:#fff; box-shadow:none; }
            .swagger-ui .btn.authorize svg { fill:#fff; }
            .swagger-ui .btn { border-radius:8px; }
            .swagger-ui select, .swagger-ui input { border-radius:8px; }
          `,
        },
      ],
    },
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
