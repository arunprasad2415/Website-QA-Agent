import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Observation } from '../browser/session.js';
import type { LLMProvider } from '../providers/types.js';
import { runAgent, type AgentEvent, type RunOptions } from './loop.js';
import type { AgentAction } from './tools.js';
import { config } from '../config.js';

config.allowPrivateUrls = true;

const pages: Record<string, string> = {
  '/': `<html lang="en"><title>Home</title>
    <a href="/form">Go to form</a> <a href="/old-page">Old page</a>
    <img src="/missing.png">
    <script>console.error('boom')</script>`,
  '/form': `<html lang="en"><title>Form</title>
    <input id="email" placeholder="Email"> <button>Send</button>`,
};

let server: Server;
let baseUrl: string;
let outDir: string;

before(async () => {
  server = createServer((req, res) => {
    const body = pages[req.url ?? ''];
    res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' }).end(body ?? 'not found');
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  outDir = await mkdtemp(join(tmpdir(), 'qa-loop-'));
});

after(async () => {
  server.close();
  await rm(outDir, { recursive: true, force: true });
});

function scripted(...moves: ((obs: Observation) => AgentAction)[]): LLMProvider {
  let i = 0;
  return { name: 'claude', model: 'scripted', decide: async ({ observation }) => moves[Math.min(i++, moves.length - 1)](observation) };
}
const idOf = (obs: Observation, label: string) => obs.elements.find((e) => e.label === label)!.id;
const options = (provider: LLMProvider, extra: Partial<RunOptions> = {}): RunOptions => ({
  url: `${baseUrl}/`,
  goal: 'Submit the form',
  provider,
  outDir: join(outDir, String(Math.random())),
  maxSteps: 10,
  timeoutMs: 60_000,
  ...extra,
});

test('agent completes a goal and collects AI + automatic bugs', async () => {
  const events: AgentEvent[] = [];
  const opts = options(
    scripted(
      () => ({ type: 'click', id: 999, reason: 'wrong id on purpose' }),
      (o) => ({ type: 'click', id: idOf(o, 'Go to form'), reason: 'open form' }),
      (o) => ({ type: 'type', id: idOf(o, 'Email'), text: 'qa@example.com', submit: false, reason: 'fill email' }),
      () => ({ type: 'report_bug', title: 'Send does nothing', severity: 'high', details: 'Clicked Send, no feedback' }),
      () => ({ type: 'finish', summary: 'Form tested' }),
    ),
    { onEvent: (e) => events.push(e) },
  );
  const result = await runAgent(opts);

  assert.equal(result.status, 'finished');
  assert.equal(result.summary, 'Form tested');
  assert.equal(result.steps.length, 5);
  assert.match(result.steps[0].result, /^failed: No element with id 999/);
  assert.match(result.steps[1].result, /^ok, now on .*\/form$/);

  const titles = result.bugs.map((b) => `${b.source}: ${b.title}`);
  for (const expected of [
    /^agent: Send does nothing$/,
    /^console: Console error$/,
    /^network: HTTP 404 loading image$/,
    /^broken_link: Broken link \(HTTP 404\)$/,
    /^accessibility: 1 image\(s\) missing alt text$/,
    /^accessibility: 1 form field\(s\) without a label$/,
  ]) {
    assert.ok(titles.some((t) => expected.test(t)), `missing bug ${expected}; got:\n${titles.join('\n')}`);
  }
  assert.equal(new Set(titles).size, titles.length, 'bugs must not be duplicated');

  assert.equal(events.filter((e) => e.type === 'step').length, 5);
  assert.equal(events.filter((e) => e.type === 'bug').length, result.bugs.length);
  for (const file of ['step-01.png', 'step-05.png', 'final.png']) assert.ok(existsSync(join(opts.outDir, file)), file);
});

test('stops at maxSteps', async () => {
  const result = await runAgent(options(scripted(() => ({ type: 'scroll', direction: 'down', reason: 'look' })), { maxSteps: 2 }));
  assert.equal(result.status, 'max_steps');
  assert.equal(result.steps.length, 2);
});

test('can be cancelled', async () => {
  const controller = new AbortController();
  const provider = scripted(() => {
    controller.abort();
    return { type: 'scroll', direction: 'down', reason: 'look' };
  });
  const result = await runAgent(options(provider, { signal: controller.signal }));
  assert.equal(result.status, 'cancelled');
  assert.equal(result.steps.length, 1);
});

test('gives up after repeated AI failures', async () => {
  let calls = 0;
  const failing: LLMProvider = {
    name: 'claude',
    model: 'broken',
    decide: async () => {
      calls++;
      throw new Error('invalid x-api-key');
    },
  };
  const result = await runAgent(options(failing));
  assert.equal(result.status, 'error');
  assert.match(result.summary, /failed 3 times in a row: invalid x-api-key/);
  assert.equal(calls, 3);
  assert.equal(result.steps.length, 0);
});

test('unreachable site ends as an error, not a crash', async () => {
  const result = await runAgent(options(scripted(() => ({ type: 'finish', summary: 'x' })), { url: 'http://127.0.0.1:1/' }));
  assert.equal(result.status, 'error');
  assert.match(result.summary, /^Run failed:/);
});
