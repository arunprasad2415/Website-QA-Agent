import { resolve } from 'node:path';

try {
  process.loadEnvFile();
} catch {}

export const PROVIDERS = ['claude', 'openai'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
  return n;
}

const defaultProvider = process.env.DEFAULT_PROVIDER || 'claude';
if (!PROVIDERS.includes(defaultProvider as ProviderName)) {
  throw new Error(`DEFAULT_PROVIDER must be one of ${PROVIDERS.join(', ')}, got "${defaultProvider}"`);
}

export const config = {
  port: positiveInt('PORT', 4000),
  defaultProvider: defaultProvider as ProviderName,
  serverKeys: {
    claude: process.env.ANTHROPIC_API_KEY || undefined,
    openai: process.env.OPENAI_API_KEY || undefined,
  } satisfies Record<ProviderName, string | undefined>,
  defaultModels: {
    claude: process.env.CLAUDE_DEFAULT_MODEL || 'claude-opus-5-5',
    openai: process.env.OPENAI_DEFAULT_MODEL || undefined,
  } satisfies Record<ProviderName, string | undefined>,
  maxConcurrentRuns: positiveInt('MAX_CONCURRENT_RUNS', 2),
  runTimeoutMs: positiveInt('RUN_TIMEOUT_MS', 300_000),
  allowPrivateUrls: process.env.ALLOW_PRIVATE_URLS === 'true',
  headless: process.env.HEADLESS !== 'false',
  reportsDir: resolve(process.env.REPORTS_DIR || 'reports'),
};
