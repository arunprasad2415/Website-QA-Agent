import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../config.js';
import { assertBaseUrl, createProvider } from './index.js';

test('custom provider needs a base URL, a key and a model', () => {
  assert.throws(() => createProvider({ provider: 'custom', apiKey: 'k', model: 'm' }), /needs a "baseUrl"/);
  assert.throws(() => createProvider({ provider: 'custom', baseUrl: 'https://api.example.com/v1', model: 'm' }), /No API key/);
  assert.throws(() => createProvider({ provider: 'custom', baseUrl: 'https://api.example.com/v1', apiKey: 'k' }), /No model[^:]*: send "model"$/);

  const llm = createProvider({ provider: 'custom', baseUrl: 'https://api.example.com/v1', apiKey: 'k', model: 'llama-vision' });
  assert.equal(llm.name, 'custom');
  assert.equal(llm.model, 'llama-vision');
  assert.equal(createProvider({ provider: 'openai', apiKey: 'k', model: 'm' }).name, 'openai');
});

test('custom base URL is checked against the private-address guard', async () => {
  config.allowPrivateUrls = false;
  try {
    await assert.rejects(assertBaseUrl('custom', undefined), /needs a "baseUrl"/);
    await assert.rejects(assertBaseUrl('custom', 'http://localhost:11434/v1'), /Invalid base URL: Blocked/);
    await assert.rejects(assertBaseUrl('custom', 'http://169.254.169.254/'), /Invalid base URL: Blocked/);
    await assert.rejects(assertBaseUrl('custom', 'ftp://example.com'), /Invalid base URL: Only http\(s\)/);
    await assertBaseUrl('custom', 'https://8.8.8.8/v1');
    await assertBaseUrl('claude', undefined);
  } finally {
    config.allowPrivateUrls = true;
  }
});
