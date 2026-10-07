import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderRequest } from '../providers/index.js';
import type { LLMProvider } from '../providers/types.js';

const reportsDir = await mkdtemp(join(tmpdir(), 'qa-runs-'));
process.env.REPORTS_DIR = reportsDir;
process.env.MAX_CONCURRENT_RUNS = '2';
process.env.ALLOW_PRIVATE_URLS = 'true';
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');

const site = createServer((req, res) => {
  const pages: Record<string, string> = {
    '/': '<html lang="en"><title>Home</title><a href="/about">About us</a><img src="/missing.png">',
    '/about': '<html lang="en"><title>About</title><p>Hi</p>',
  };
  const body = pages[req.url ?? ''];
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' }).end(body ?? 'not found');
}).listen(0, '127.0.0.1');
await once(site, 'listening');
const siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}/`;

const keysSeen: (string | undefined)[] = [];
const baseUrlsSeen: (string | undefined)[] = [];
let quickTurn = 0;
const quick: LLMProvider = {
  name: 'claude',
  model: 'quick',
  decide: async ({ observation }) =>
    quickTurn++ % 2 === 0
      ? { type: 'click', id: observation.elements.find((e) => e.label === 'About us')!.id, reason: 'open about' }
      : { type: 'finish', summary: 'About page works' },
};
const slow: LLMProvider = {
  name: 'claude',
  model: 'slow',
  decide: ({ signal }) => new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted')))),
};
const app = await buildApp({
  logger: false,
  createProvider: (req: ProviderRequest) => {
    keysSeen.push(req.apiKey);
    baseUrlsSeen.push(req.baseUrl);
    return req.model === 'slow' ? slow : quick;
  },
});

after(async () => {
  await app.close();
  site.close();
  await rm(reportsDir, { recursive: true, force: true });
});

const start = (body: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/runs', payload: { url: siteUrl, goal: 'Check the About page', ...body } });

test('start a run, stream it live, then read the result and screenshots', async () => {
  const res = await start({ apiKey: 'sk-secret-byok-123', maxSteps: 5 });
  assert.equal(res.statusCode, 202);
  const { runId } = res.json();
  assert.equal(keysSeen.at(-1), 'sk-secret-byok-123', 'BYOK key reaches the provider');

  const events = await app.inject({ url: `/api/runs/${runId}/events` });
  assert.match(String(events.headers['content-type']), /text\/event-stream/);
  assert.equal(events.body.match(/event: step/g)?.length, 2);
  assert.match(events.body, /event: bug/);
  assert.match(events.body, /event: done\ndata: \{"status":"finished","summary":"About page works"\}/);

  const run = (await app.inject({ url: `/api/runs/${runId}` })).json();
  assert.equal(run.status, 'finished');
  assert.equal(run.steps.length, 2);
  assert.equal(run.steps[0].screenshot, 'step-01.png');
  assert.ok(run.bugs.some((b: { source: string }) => b.source === 'network'));

  const shot = await app.inject({ url: `/api/runs/${runId}/screenshots/step-01.png` });
  assert.equal(shot.statusCode, 200);
  assert.equal(shot.headers['content-type'], 'image/png');
  for (const bad of ['..%2Frun.json', 'run.json', 'step-99.png']) {
    assert.equal((await app.inject({ url: `/api/runs/${runId}/screenshots/${bad}` })).statusCode, 404, bad);
  }

  const list = (await app.inject({ url: '/api/runs' })).json();
  assert.equal(list[0].id, runId);
  assert.equal(list[0].stepCount, 2);
  assert.equal(list[0].steps, undefined, 'list is a summary');

  const replay = await app.inject({ url: `/api/runs/${runId}/events` });
  assert.equal(replay.body.match(/event: step/g)?.length, 2);

  const report = await app.inject({ url: `/api/runs/${runId}/report` });
  assert.equal(report.statusCode, 200);
  assert.match(String(report.headers['content-type']), /text\/markdown/);
  assert.match(report.body, /\| 1 \| Click "About us" \|/);
  assert.match(report.body, /\(screenshots\/step-01\.png\)/);
  const savedReport = await readFile(join(reportsDir, runId, 'report.md'), 'utf8');
  assert.match(savedReport, /\(step-01\.png\)/);

  const saved = await readFile(join(reportsDir, runId, 'run.json'), 'utf8');
  assert.equal(JSON.parse(saved).status, 'finished');
  for (const text of [saved, savedReport, report.body, JSON.stringify(run), JSON.stringify(list)]) {
    assert.ok(!text.includes('sk-secret-byok'));
  }
});

test('rejects bad input', async () => {
  assert.equal((await start({ url: 'file:///C:/Windows/win.ini' })).statusCode, 400);
  assert.equal((await start({ url: 'not a url' })).statusCode, 400);
  assert.equal((await start({ provider: 'gemini' })).statusCode, 400);
  assert.equal((await start({ maxSteps: 999 })).statusCode, 400);
  assert.equal((await start({ goal: '' })).statusCode, 400);
  assert.equal((await app.inject({ url: '/api/runs/nope' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/api/runs/nope/cancel' })).statusCode, 404);
});

test('rejects private addresses when ALLOW_PRIVATE_URLS is off', async () => {
  config.allowPrivateUrls = false;
  try {
    for (const url of [siteUrl, 'http://169.254.169.254/latest/meta-data/', 'http://[::1]:4000/']) {
      const res = await start({ url });
      assert.equal(res.statusCode, 400, url);
      assert.match(res.json().message, /private or local address/);
    }
  } finally {
    config.allowPrivateUrls = true;
  }
});

test('custom provider: base URL is required, guarded, and passed through', async () => {
  const custom = { provider: 'custom', apiKey: 'k', model: 'm' };
  assert.match((await start(custom)).json().message, /needs a "baseUrl"/);

  config.allowPrivateUrls = false;
  try {
    const blocked = await start({ ...custom, url: 'https://8.8.8.8/', baseUrl: 'http://127.0.0.1:11434/v1' });
    assert.equal(blocked.statusCode, 400);
    assert.match(blocked.json().message, /Invalid base URL: Blocked/);

    const check = await app.inject({
      method: 'POST',
      url: '/api/keys/validate',
      payload: { provider: 'custom', apiKey: 'k', baseUrl: 'http://10.0.0.5/v1' },
    });
    assert.equal(check.statusCode, 400);
    assert.match(check.json().message, /Invalid base URL: Blocked/);
  } finally {
    config.allowPrivateUrls = true;
  }

  const ok = await start({ ...custom, baseUrl: 'https://llm.example.com/v1' });
  assert.equal(ok.statusCode, 202);
  assert.equal(baseUrlsSeen.at(-1), 'https://llm.example.com/v1');
  await app.inject({ url: `/api/runs/${ok.json().runId}/events` });
});

test('cancel, and the concurrent-run limit', async () => {
  const a = (await start({ model: 'slow' })).json().runId;
  const b = (await start({ model: 'slow' })).json().runId;
  const third = await start({ model: 'slow' });
  assert.equal(third.statusCode, 429);

  assert.equal((await app.inject({ method: 'POST', url: `/api/runs/${a}/cancel` })).statusCode, 202);
  const events = await app.inject({ url: `/api/runs/${a}/events` });
  assert.match(events.body, /event: done\ndata: \{"status":"cancelled"/);
  assert.equal((await app.inject({ method: 'POST', url: `/api/runs/${a}/cancel` })).statusCode, 409);

  const c = await start({ model: 'slow' });
  assert.equal(c.statusCode, 202);
  for (const id of [b, c.json().runId]) {
    await app.inject({ method: 'POST', url: `/api/runs/${id}/cancel` });
    await app.inject({ url: `/api/runs/${id}/events` });
  }
});
