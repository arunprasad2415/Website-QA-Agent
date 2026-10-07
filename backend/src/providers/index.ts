import { config, type ProviderName } from '../config.js';
import { ClaudeProvider, validateClaudeKey } from './claude.js';
import { OpenAIProvider, validateOpenAIKey } from './openai.js';
import type { LLMProvider } from './types.js';

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
};

export function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export interface ProviderRequest {
  provider: ProviderName;
  model?: string;
  apiKey?: string;
}

export function createProvider({ provider, model, apiKey }: ProviderRequest): LLMProvider {
  const key = apiKey || config.serverKeys[provider];
  if (!key) {
    throw httpError(400, `No API key for ${PROVIDER_LABELS[provider]}: send your own "apiKey" (BYOK) or set one on the server`);
  }
  const resolvedModel = model || config.defaultModels[provider];
  if (!resolvedModel) {
    const envVar = provider === 'claude' ? 'CLAUDE_DEFAULT_MODEL' : 'OPENAI_DEFAULT_MODEL';
    throw httpError(400, `No model for ${PROVIDER_LABELS[provider]}: send "model" or set ${envVar} on the server`);
  }
  return provider === 'claude' ? new ClaudeProvider(key, resolvedModel) : new OpenAIProvider(key, resolvedModel);
}

export function validateKey(provider: ProviderName, apiKey: string): Promise<boolean> {
  return provider === 'claude' ? validateClaudeKey(apiKey) : validateOpenAIKey(apiKey);
}
