import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { getDb } from '../db/client.js';
import { type Services, createServices } from '../services/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    services: Services;
  }
}

/**
 * Builds the service graph once at boot and hangs it off the app instance, so
 * route handlers stay thin and every request shares one connection pool.
 */
export const servicesPlugin = fp(async (app: FastifyInstance) => {
  const db = await getDb();
  app.decorate('services', createServices(db));
});
