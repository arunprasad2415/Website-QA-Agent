import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunRecord } from '../runs/store.js';
import { buildReport } from './markdown.js';

const run: RunRecord = {
  id: 'r1',
  url: 'https://shop.example.com/',
  goal: 'Test the signup flow',
  provider: 'claude',
  model: 'claude-opus-5-5',
  maxSteps: 25,
  status: 'finished',
  summary: 'Signup works but has 2 issues',
  createdAt: '2026-10-07T10:00:00.000Z',
  finishedAt: '2026-10-07T10:01:30.000Z',
  steps: [
    { step: 1, action: { type: 'click', id: 4, reason: 'open signup' }, target: 'Sign up', result: 'ok, now on https://shop.example.com/signup', screenshot: 'step-01.png' },
    { step: 2, action: { type: 'click', id: 99, reason: 'oops' }, result: 'failed: No element with id 99', screenshot: 'step-02.png' },
    { step: 3, action: { type: 'type', id: 2, text: 'qa@example.com', submit: true, reason: 'email' }, target: 'Email', result: 'ok', screenshot: 'step-03.png' },
    { step: 4, action: { type: 'report_bug', title: 'No confirmation', severity: 'high', details: 'x' }, result: 'bug reported', screenshot: 'step-04.png' },
    { step: 5, action: { type: 'finish', summary: 'done' }, result: 'finished', screenshot: 'step-05.png' },
  ],
  bugs: [
    { source: 'accessibility', title: '1 image(s) missing alt text', severity: 'low', details: '<img src="a.png">', pageUrl: 'https://shop.example.com/', step: 1, screenshot: 'step-01.png' },
    { source: 'agent', title: 'No confirmation | <script>alert(1)</script> ![x](http://evil.test/p.png)', severity: 'high', details: 'Has ``` fence inside', pageUrl: 'https://shop.example.com/signup', step: 4, screenshot: 'step-04.png' },
    { source: 'console', title: 'Console error', severity: 'medium', details: 'boom', pageUrl: 'https://shop.example.com/signup', step: 5, screenshot: 'final.png' },
  ],
};

test('report has overview, bugs by severity, reproduction steps and screenshots', () => {
  const report = buildReport(run, 'screenshots/');

  assert.match(report, /^# QA Report: Test the signup flow/);
  assert.match(report, /\| Status \| ✅ Finished \|/);
  assert.match(report, /\| Duration \| 1m 30s \|/);
  assert.match(report, /\| Bugs \| 3 \(1 high, 1 medium, 1 low\) \|/);

  const order = [...report.matchAll(/^### \d+\. \[(\w+)\]/gm)].map((m) => m[1]);
  assert.deepEqual(order, ['HIGH', 'MEDIUM', 'LOW']);

  const highBug = report.slice(report.indexOf('### 1.'), report.indexOf('### 2.'));
  assert.match(highBug, /1\. Open https:\/\/shop\.example\.com\/\n2\. Click "Sign up"\n3\. Type "qa@example\.com" into "Email" and press Enter\n\n/);
  assert.ok(!highBug.includes('element #99'));
  assert.match(highBug, /!\[Screenshot at step 4\]\(screenshots\/step-04\.png\)/);

  const consoleBug = report.slice(report.indexOf('### 2.'), report.indexOf('### 3.'));
  assert.match(consoleBug, /3\. Type "qa@example\.com"/);
  assert.match(consoleBug, /\(screenshots\/final\.png\)/);

  assert.match(report, /\| 2 \| Click "element \\#99" \| failed: No element with id 99 \|/);
});

test('untrusted text cannot inject HTML, images or break tables and code blocks', () => {
  const report = buildReport(run);
  assert.ok(!report.includes('<script>'));
  assert.ok(!report.includes('![x]('), 'title must not become an image');
  assert.match(report, /No confirmation \\\| &lt;script&gt;/);
  assert.match(report, /````\nHas ``` fence inside\n````/);
  assert.match(report, /```\n<img src="a.png">\n```/, 'details stay verbatim inside a code block');
  assert.match(report, /\(step-01\.png\)/, 'report.md links screenshots next to it');
});

test('report works mid-run', () => {
  const report = buildReport({ ...run, status: 'running', summary: undefined, finishedAt: undefined, bugs: [] });
  assert.match(report, /\| Status \| ⏳ Running \|/);
  assert.match(report, /\| Duration \| in progress \|/);
  assert.match(report, /No bugs found\./);
});
