import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createProvider } from './providers/index.js';
import { providerRoutes } from './routes/providers.js';
import { runRoutes, type RunRoutesOptions } from './routes/runs.js';

export interface AppOptions {
  logger?: boolean;
  createProvider?: RunRoutesOptions['createProvider'];
  staticDir?: string;
}

export async function buildApp(opts: AppOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? true });
  app.get('/api/health', async () => ({ status: 'ok' }));
  await app.register(providerRoutes);
  await app.register(runRoutes, { createProvider: opts.createProvider ?? createProvider });

  if (opts.staticDir && existsSync(join(opts.staticDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: opts.staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: `Route ${req.method}:${req.url} not found` });
    });
  }
  return app;
}
