import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { agentRoutes } from './agents.routes.js';
import { dataApiRoutes } from './api.routes.js';
import { healthRoutes } from './health.routes.js';
import { installRoutes } from './install.routes.js';
import { publishRoutes } from './publish.routes.js';
import { runtimeRoutes } from './runtime.routes.js';
import { searchRoutes } from './search.routes.js';
import { toolRoutes } from './tools.routes.js';

/**
 * Registered flat at the root: the REST surface is the product's public
 * contract. Versioning it (`/v1`) is handled by mounting this same plugin under
 * a prefix, so it stays a one-line change.
 */
export const apiRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(healthRoutes);
  await app.register(agentRoutes);
  await app.register(toolRoutes);
  await app.register(runtimeRoutes);
  await app.register(searchRoutes);
  await app.register(installRoutes);
  await app.register(publishRoutes);
  // The unified external-data API.
  await app.register(dataApiRoutes);
};
