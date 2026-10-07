import type { FastifyInstance } from 'fastify';
import { config, PROVIDERS, type ProviderName } from '../config.js';
import { assertBaseUrl, httpError, PROVIDER_LABELS, validateKey } from '../providers/index.js';

export async function providerRoutes(app: FastifyInstance) {
  app.get('/api/providers', async () => ({
    defaultProvider: config.defaultProvider,
    providers: PROVIDERS.map((name) => ({
      name,
      label: PROVIDER_LABELS[name],
      serverKey: Boolean(config.serverKeys[name]),
      defaultModel: config.defaultModels[name] ?? null,
    })),
  }));

  app.post<{ Body: { provider: ProviderName; apiKey: string; baseUrl?: string } }>(
    '/api/keys/validate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['provider', 'apiKey'],
          additionalProperties: false,
          properties: {
            provider: { type: 'string', enum: [...PROVIDERS] },
            apiKey: { type: 'string', minLength: 1, maxLength: 500 },
            baseUrl: { type: 'string', minLength: 1, maxLength: 500 },
          },
        },
      },
    },
    async (req) => {
      const { provider, apiKey, baseUrl } = req.body;
      await assertBaseUrl(provider, baseUrl);
      try {
        return { valid: await validateKey(provider, apiKey, baseUrl) };
      } catch {
        const where = provider === 'custom' ? 'this base URL' : PROVIDER_LABELS[provider];
        throw httpError(502, `Could not reach ${where} to check the key, try again`);
      }
    },
  );
}
