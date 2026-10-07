import Fastify from 'fastify';
import { createProvider } from './providers/index.js';
import { providerRoutes } from './routes/providers.js';
import { runRoutes, type RunRoutesOptions } from './routes/runs.js';

export interface AppOptions {
  logger?: boolean;
  createProvider?: RunRoutesOptions['createProvider'];
}

export async function buildApp(opts: AppOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? true });
  app.get('/api/health', async () => ({ status: 'ok' }));
  await app.register(providerRoutes);
  await app.register(runRoutes, { createProvider: opts.createProvider ?? createProvider });
  return app;
}
