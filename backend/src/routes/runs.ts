import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runAgent } from '../agent/loop.js';
import { assertAllowedUrl } from '../browser/url-guard.js';
import { config, PROVIDERS, type ProviderName } from '../config.js';
import { httpError, type ProviderRequest } from '../providers/index.js';
import type { LLMProvider } from '../providers/types.js';
import { buildReport } from '../report/markdown.js';
import { activeRunCount, finishRun, getLiveRun, getRun, listRuns, recordEvent, runDir, startRun } from '../runs/store.js';

const DEFAULT_MAX_STEPS = 25;
const MAX_STEPS_LIMIT = 50;
const SCREENSHOT_NAME = /^(step-\d+|final)\.png$/;

interface StartBody {
  url: string;
  goal: string;
  provider?: ProviderName;
  model?: string;
  apiKey?: string;
  maxSteps?: number;
}

export interface RunRoutesOptions {
  createProvider: (req: ProviderRequest) => LLMProvider;
}

export async function runRoutes(app: FastifyInstance, opts: RunRoutesOptions) {
  app.post<{ Body: StartBody }>(
    '/api/runs',
    {
      schema: {
        body: {
          type: 'object',
          required: ['url', 'goal'],
          additionalProperties: false,
          properties: {
            url: { type: 'string', minLength: 1, maxLength: 2000 },
            goal: { type: 'string', minLength: 1, maxLength: 1000 },
            provider: { type: 'string', enum: [...PROVIDERS] },
            model: { type: 'string', minLength: 1, maxLength: 100 },
            apiKey: { type: 'string', minLength: 1, maxLength: 500 },
            maxSteps: { type: 'integer', minimum: 1, maximum: MAX_STEPS_LIMIT },
          },
        },
      },
    },
    async (req, reply) => {
      const { url, goal, provider = config.defaultProvider, model, apiKey, maxSteps = DEFAULT_MAX_STEPS } = req.body;
      try {
        await assertAllowedUrl(url);
      } catch (err) {
        throw httpError(400, `Invalid url: ${(err as Error).message}`);
      }
      if (activeRunCount() >= config.maxConcurrentRuns) {
        throw httpError(429, `Too many runs in progress (max ${config.maxConcurrentRuns}), try again shortly`);
      }

      const llm = opts.createProvider({ provider, model, apiKey });
      const run = startRun({ url, goal, provider, model: llm.model, maxSteps });

      void runAgent({
        url,
        goal,
        provider: llm,
        outDir: runDir(run.record.id),
        maxSteps,
        timeoutMs: config.runTimeoutMs,
        signal: run.controller.signal,
        onEvent: (event) => recordEvent(run, event),
      })
        .then((result) => finishRun(run, result))
        .catch((err) => app.log.error(err, `failed to save run ${run.record.id}`));

      return reply.code(202).send({ runId: run.record.id });
    },
  );

  app.get('/api/runs', async () => listRuns());

  app.get<{ Params: { id: string } }>('/api/runs/:id', async (req) => {
    const record = getRun(req.params.id);
    if (!record) throw httpError(404, 'Run not found');
    return record;
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id/events', async (req, reply) => {
    const record = getRun(req.params.id);
    if (!record) throw httpError(404, 'Run not found');

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    for (const step of record.steps) send('step', step);
    for (const bug of record.bugs) send('bug', bug);

    const run = getLiveRun(record.id);
    if (!run) {
      send('done', { status: record.status, summary: record.summary });
      res.end();
      return;
    }

    const onStep = (step: unknown) => send('step', step);
    const onBug = (bug: unknown) => send('bug', bug);
    const onDone = (done: unknown) => {
      send('done', done);
      cleanup();
      res.end();
    };
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    const cleanup = () => {
      clearInterval(heartbeat);
      run.events.off('step', onStep).off('bug', onBug).off('done', onDone);
    };
    run.events.on('step', onStep).on('bug', onBug).on('done', onDone);
    req.raw.on('close', cleanup);
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id/report', async (req, reply) => {
    const record = getRun(req.params.id);
    if (!record) throw httpError(404, 'Run not found');
    return reply.type('text/markdown; charset=utf-8').send(buildReport(record, 'screenshots/'));
  });

  app.post<{ Params: { id: string } }>('/api/runs/:id/cancel', async (req, reply) => {
    if (!getRun(req.params.id)) throw httpError(404, 'Run not found');
    const run = getLiveRun(req.params.id);
    if (!run) throw httpError(409, 'Run has already finished');
    run.controller.abort();
    return reply.code(202).send({ status: 'cancelling' });
  });

  app.get<{ Params: { id: string; file: string } }>('/api/runs/:id/screenshots/:file', async (req, reply) => {
    const { id, file } = req.params;
    if (!getRun(id) || !SCREENSHOT_NAME.test(file)) throw httpError(404, 'Screenshot not found');
    try {
      return reply.type('image/png').send(await readFile(join(runDir(id), file)));
    } catch {
      throw httpError(404, 'Screenshot not found');
    }
  });
}
