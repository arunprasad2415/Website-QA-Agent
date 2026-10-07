import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { buildApp } from '../app.js';
import { config } from '../config.js';
import { scriptedProvider, startDemoSite } from '../demo/fixtures.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let site: { server: Server; url: string };
let browser: Browser;
let base: string;
let reportsDir: string;

before(async () => {
  assert.ok(
    existsSync(join(config.frontendDir, 'index.html')),
    `No frontend build at ${config.frontendDir}. Run "npm run build" in frontend first.`,
  );
  reportsDir = await mkdtemp(join(tmpdir(), 'qa-e2e-'));
  config.reportsDir = reportsDir;
  config.allowPrivateUrls = true;
  config.serverKeys.claude = 'demo';

  site = await startDemoSite();
  app = await buildApp({
    logger: false,
    staticDir: config.frontendDir,
    createProvider: (req) => scriptedProvider(req.model, 150),
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await app?.close();
  site?.server.close();
  await rm(reportsDir, { recursive: true, force: true });
});

async function startTest(page: Page, model?: string) {
  await page.goto(`${base}/`);
  await page.getByText('API online').waitFor();
  await page.getByLabel('Website URL').fill(site.url);
  await page.getByRole('button', { name: 'Test the signup flow' }).click();
  if (model) await page.getByLabel(/^Model/).fill(model);
  await page.getByRole('button', { name: 'Start test' }).click();
  await page.waitForURL(/\/runs\/[0-9a-f-]{36}$/);
}

test('a full test run: start, watch live, inspect bugs, download the report', async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await startTest(page);
  await page.getByText('Test finished').waitFor({ timeout: 30_000 });
  assert.equal(await page.locator('ol li button').count(), 9);

  await page.getByRole('tab', { name: /Bugs/ }).click();
  const titles = await page.locator('ul li p.font-medium').allInnerTexts();
  assert.equal(titles[0], 'Choose Pro button does nothing', 'highest severity first');
  assert.ok(titles.includes('Signup gives no feedback after submit'));
  assert.ok(titles.length >= 5, `AI bugs plus automatic checks, got ${titles.length}`);

  await page.getByRole('button', { name: 'View step 3' }).click();
  assert.equal(await page.getByText('Step 3', { exact: true }).count(), 1);

  const href = await page.getByRole('link', { name: 'Download report' }).getAttribute('href');
  const report = await (await page.request.get(base + href)).text();
  assert.match(report, /^# QA Report: Test the signup flow/);
  assert.match(report, /Choose Pro button does nothing/);

  await page.getByRole('link', { name: 'All runs' }).click();
  await page.locator('tbody tr').first().waitFor();
  assert.match(await page.locator('tbody tr').first().innerText(), /Finished/);

  assert.deepEqual(errors, []);
  await page.close();
});

test('a running test can be stopped', async () => {
  const page = await browser.newPage();
  await startTest(page, 'slow');
  await page.locator('ol li button').first().waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Stop run' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Stop run' }).click();
  await page.getByText('Run stopped').waitFor({ timeout: 15_000 });
  await page.close();
});

test('the backend serves the app: deep links work, unknown API routes stay JSON', async () => {
  const page = await browser.newPage();
  await page.goto(`${base}/history`);
  await page.getByRole('heading', { name: 'Test runs' }).waitFor();

  const res = await page.request.get(`${base}/api/does-not-exist`);
  assert.equal(res.status(), 404);
  assert.equal((await res.json()).statusCode, 404);
  await page.close();
});
