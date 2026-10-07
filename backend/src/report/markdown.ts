import type { Bug } from '../agent/checks.js';
import { SEVERITIES, type StepLog } from '../agent/tools.js';
import { PROVIDER_LABELS } from '../providers/index.js';
import type { RunRecord } from '../runs/store.js';

const SEVERITY_ORDER = [...SEVERITIES].reverse();

const STATUS_LABELS: Record<RunRecord['status'], string> = {
  running: '⏳ Running',
  finished: '✅ Finished',
  max_steps: '⚠️ Stopped at the step limit',
  timeout: '⏱️ Timed out',
  cancelled: '⏹️ Cancelled',
  error: '❌ Error',
};

const SOURCE_LABELS: Record<Bug['source'], string> = {
  agent: 'AI tester',
  console: 'Automatic check (console)',
  network: 'Automatic check (network)',
  accessibility: 'Automatic check (accessibility)',
  broken_link: 'Automatic check (links)',
};

export function buildReport(run: RunRecord, imageBase = ''): string {
  const bugs = [...run.bugs].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.step - b.step,
  );
  const counts = SEVERITY_ORDER.map((s) => [s, bugs.filter((b) => b.severity === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
    .join(', ');

  const out = [
    `# QA Report: ${md(run.goal)}`,
    '',
    '| | |',
    '|---|---|',
    `| Website | ${md(run.url)} |`,
    `| Status | ${STATUS_LABELS[run.status]} |`,
    `| AI | ${PROVIDER_LABELS[run.provider]} (${md(run.model)}) |`,
    `| Started | ${run.createdAt} |`,
    `| Duration | ${run.finishedAt ? duration(run.createdAt, run.finishedAt) : 'in progress'} |`,
    `| Steps | ${run.steps.length} / ${run.maxSteps} |`,
    `| Bugs | ${bugs.length}${counts ? ` (${counts})` : ''} |`,
    '',
    '## Summary',
    '',
    md(run.summary ?? 'Run in progress.'),
    '',
    `## Bugs (${bugs.length})`,
    '',
  ];
  if (!bugs.length) out.push('No bugs found.', '');

  bugs.forEach((bug, i) => {
    out.push(
      `### ${i + 1}. [${bug.severity.toUpperCase()}] ${md(bug.title)}`,
      '',
      `- **Found by:** ${SOURCE_LABELS[bug.source]}`,
      `- **Page:** ${md(bug.pageUrl)}`,
      `- **Step:** ${bug.step}`,
      '',
      fence(bug.details),
      '',
      '**Steps to reproduce:**',
      '',
      ...reproduce(run, bug),
      '',
      `![Screenshot at step ${bug.step}](${imageBase}${bug.screenshot})`,
      '',
    );
  });

  out.push(
    '## Test steps',
    '',
    '| # | Action | Result |',
    '|---|---|---|',
    ...run.steps.map((s) => `| ${s.step} | ${md(describe(s))} | ${md(s.result)} |`),
    '',
  );
  return out.join('\n');
}

function reproduce(run: RunRecord, bug: Bug): string[] {
  const upTo = bug.screenshot === 'final.png' ? bug.step + 1 : bug.step;
  const actions = run.steps.filter(
    (s) => s.step < upTo && s.action.type !== 'report_bug' && s.action.type !== 'finish' && !s.result.startsWith('failed'),
  );
  return [`1. Open ${md(run.url)}`, ...actions.map((s, i) => `${i + 2}. ${md(describe(s))}`)];
}

function describe({ action, target }: StepLog): string {
  const el = (id: number) => `"${target || `element #${id}`}"`;
  switch (action.type) {
    case 'click':
      return `Click ${el(action.id)}`;
    case 'type':
      return `Type "${action.text}" into ${el(action.id)}${action.submit ? ' and press Enter' : ''}`;
    case 'goto':
      return `Go to ${action.url}`;
    case 'scroll':
      return `Scroll ${action.direction}`;
    case 'report_bug':
      return `Report bug: ${action.title}`;
    case 'finish':
      return 'Finish testing';
  }
}

function md(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\`*_[\]|#!]/g, '\\$&')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fence(text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const f = '`'.repeat(longest + 1);
  return `${f}\n${text}\n${f}`;
}

function duration(from: string, to: string): string {
  const s = Math.round((Date.parse(to) - Date.parse(from)) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}
