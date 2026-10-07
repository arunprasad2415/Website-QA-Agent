import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Bug } from '../agent/checks.js';
import type { AgentEvent, RunResult, RunStatus } from '../agent/loop.js';
import type { StepLog } from '../agent/tools.js';
import { config, type ProviderName } from '../config.js';
import { buildReport } from '../report/markdown.js';

export type StepRecord = StepLog & { screenshot: string };

export interface RunRecord {
  id: string;
  url: string;
  goal: string;
  provider: ProviderName;
  model: string;
  maxSteps: number;
  status: 'running' | RunStatus;
  summary?: string;
  createdAt: string;
  finishedAt?: string;
  steps: StepRecord[];
  bugs: Bug[];
}

export interface LiveRun {
  record: RunRecord;
  controller: AbortController;
  events: EventEmitter;
}

const runs = new Map<string, RunRecord>();
const live = new Map<string, LiveRun>();

export const runDir = (id: string) => join(config.reportsDir, id);

export async function loadRuns(): Promise<number> {
  const dirs = await readdir(config.reportsDir).catch(() => []);
  for (const dir of dirs) {
    try {
      const record: RunRecord = JSON.parse(await readFile(join(config.reportsDir, dir, 'run.json'), 'utf8'));
      runs.set(record.id, record);
    } catch {
    }
  }
  return runs.size;
}

export function startRun(input: Pick<RunRecord, 'url' | 'goal' | 'provider' | 'model' | 'maxSteps'>): LiveRun {
  const record: RunRecord = { id: randomUUID(), ...input, status: 'running', createdAt: new Date().toISOString(), steps: [], bugs: [] };
  const run: LiveRun = { record, controller: new AbortController(), events: new EventEmitter() };
  runs.set(record.id, record);
  live.set(record.id, run);
  return run;
}

export function recordEvent(run: LiveRun, event: AgentEvent): void {
  if (event.type === 'step') {
    const step: StepRecord = { ...event.step, screenshot: event.screenshot };
    run.record.steps.push(step);
    run.events.emit('step', step);
  } else {
    run.record.bugs.push(event.bug);
    run.events.emit('bug', event.bug);
  }
}

export async function finishRun(run: LiveRun, result: RunResult): Promise<void> {
  const { record } = run;
  record.status = result.status;
  record.summary = result.summary;
  record.finishedAt = new Date().toISOString();
  try {
    await mkdir(runDir(record.id), { recursive: true });
    await writeFile(join(runDir(record.id), 'run.json'), JSON.stringify(record, null, 2));
    await writeFile(join(runDir(record.id), 'report.md'), buildReport(record));
  } finally {
    live.delete(record.id);
    run.events.emit('done', { status: record.status, summary: record.summary });
  }
}

export const getRun = (id: string) => runs.get(id);
export const getLiveRun = (id: string) => live.get(id);
export const activeRunCount = () => live.size;

export function listRuns() {
  return [...runs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ steps, bugs, ...rest }) => ({ ...rest, stepCount: steps.length, bugCount: bugs.length }));
}
