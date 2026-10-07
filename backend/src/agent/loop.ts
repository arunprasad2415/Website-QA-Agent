import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserSession } from '../browser/session.js';
import type { LLMProvider } from '../providers/types.js';
import { AutoChecks, type Bug } from './checks.js';
import type { AgentAction, StepLog } from './tools.js';

export type RunStatus = 'finished' | 'max_steps' | 'timeout' | 'cancelled' | 'error';

export interface RunResult {
  status: RunStatus;
  summary: string;
  steps: StepLog[];
  bugs: Bug[];
}

export type AgentEvent =
  | { type: 'step'; step: StepLog; screenshot: string }
  | { type: 'bug'; bug: Bug };

export interface RunOptions {
  url: string;
  goal: string;
  provider: LLMProvider;
  outDir: string;
  maxSteps: number;
  timeoutMs: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}

const MAX_DECIDE_FAILURES = 3;

export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const { url, goal, provider, outDir, maxSteps, onEvent = () => {} } = opts;
  const signal = AbortSignal.any([opts.signal ?? new AbortController().signal, AbortSignal.timeout(opts.timeoutMs)]);
  const stopReason = (): [RunStatus, string] =>
    opts.signal?.aborted ? ['cancelled', 'Run was cancelled'] : ['timeout', `Run hit the ${opts.timeoutMs / 1000}s time limit`];

  const steps: StepLog[] = [];
  const bugs: Bug[] = [];
  const addBugs = (found: Bug[]) => {
    for (const bug of found) {
      bugs.push(bug);
      onEvent({ type: 'bug', bug });
    }
  };
  const save = async (name: string, png: Buffer) => {
    await writeFile(join(outDir, name), png);
    return name;
  };

  let status: RunStatus = 'max_steps';
  let summary = `Stopped after reaching the ${maxSteps}-step limit`;
  const checks = new AutoChecks();
  let session: BrowserSession | undefined;

  try {
    await mkdir(outDir, { recursive: true });
    session = await BrowserSession.open(url);
    let failures = 0;

    while (steps.length < maxSteps) {
      if (signal.aborted) {
        [status, summary] = stopReason();
        break;
      }
      const n = steps.length + 1;
      const observation = await session.observe();
      const screenshot = await save(`step-${String(n).padStart(2, '0')}.png`, observation.screenshot);
      addBugs(await checks.run(session, n, screenshot));

      let action: AgentAction;
      try {
        action = await provider.decide({ goal, observation, history: steps, signal });
        failures = 0;
      } catch (err) {
        if (signal.aborted) {
          [status, summary] = stopReason();
          break;
        }
        if (++failures >= MAX_DECIDE_FAILURES) {
          [status, summary] = ['error', `AI provider failed ${failures} times in a row: ${errorMessage(err)}`];
          break;
        }
        continue;
      }

      const target = 'id' in action ? observation.elements.find((e) => e.id === action.id)?.label : undefined;
      const log: StepLog = { step: n, action, target, result: await execute(session, action) };
      steps.push(log);
      onEvent({ type: 'step', step: log, screenshot });

      if (action.type === 'report_bug') {
        const { title, severity, details } = action;
        addBugs([{ source: 'agent', title, severity, details, pageUrl: observation.url, step: n, screenshot }]);
      }
      if (action.type === 'finish') {
        [status, summary] = ['finished', action.summary];
        break;
      }
    }
  } catch (err) {
    [status, summary] = ['error', `Run failed: ${errorMessage(err)}`];
  }

  try {
    if (session) {
      const screenshot = await save('final.png', (await session.observe()).screenshot);
      addBugs(await checks.run(session, steps.length, screenshot));
    }
  } catch {
  } finally {
    await session?.close();
    await checks.close();
  }

  return { status, summary, steps, bugs };
}

async function execute(session: BrowserSession, action: AgentAction): Promise<string> {
  try {
    switch (action.type) {
      case 'click':
        await session.click(action.id);
        break;
      case 'type':
        await session.type(action.id, action.text, action.submit);
        break;
      case 'goto':
        await session.goto(action.url);
        break;
      case 'scroll':
        await session.scroll(action.direction);
        break;
      case 'report_bug':
        return 'bug reported';
      case 'finish':
        return 'finished';
    }
    return `ok, now on ${session.page.url()}`;
  } catch (err) {
    return `failed: ${errorMessage(err)}`;
  }
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 300);
}
