import { assertAllowedUrl } from '../browser/url-guard.js';
import { config, type ProviderName } from '../config.js';
import { ClaudeProvider, validateClaudeKey } from './claude.js';
import { OpenAIProvider, validateOpenAIKey } from './openai.js';
import type { LLMProvider } from './types.js';

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
  custom: 'Custom (OpenAI-compatible)',
};

const MODEL_ENV_VARS: Partial<Record<ProviderName, string>> = {
  claude: 'CLAUDE_DEFAULT_MODEL',
  openai: 'OPENAI_DEFAULT_MODEL',
};

export function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export interface ProviderRequest {
  provider: ProviderName;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export async function assertBaseUrl(provider: ProviderName, baseUrl: string | undefined): Promise<void> {
  if (provider !== 'custom') return;
  if (!baseUrl) throw httpError(400, 'Custom provider needs a "baseUrl", for example https://openrouter.ai/api/v1');
  try {
    await assertAllowedUrl(baseUrl);
  } catch (err) {
    throw httpError(400, `Invalid base URL: ${(err as Error).message}`);
  }
}

export function createProvider({ provider, model, apiKey, baseUrl }: ProviderRequest): LLMProvider {
  if (provider === 'custom' && !baseUrl) {
    throw httpError(400, 'Custom provider needs a "baseUrl", for example https://openrouter.ai/api/v1');
  }
  const key = apiKey || config.serverKeys[provider];
  if (!key) {
    throw httpError(400, `No API key for ${PROVIDER_LABELS[provider]}: send your own "apiKey" (BYOK) or set one on the server`);
  }
  const resolvedModel = model || config.defaultModels[provider];
  if (!resolvedModel) {
    const envVar = MODEL_ENV_VARS[provider];
    throw httpError(400, `No model for ${PROVIDER_LABELS[provider]}: send "model"${envVar ? ` or set ${envVar} on the server` : ''}`);
  }
  if (provider === 'claude') return new ClaudeProvider(key, resolvedModel);
  return new OpenAIProvider(key, resolvedModel, provider === 'custom' ? baseUrl : undefined);
}

export function validateKey(provider: ProviderName, apiKey: string, baseUrl?: string): Promise<boolean> {
  if (provider === 'claude') return validateClaudeKey(apiKey);
  return validateOpenAIKey(apiKey, provider === 'custom' ? baseUrl : undefined);
}
