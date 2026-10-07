import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { config } from '../config.js';
import { BrowserSession } from './session.js';
import { assertAllowedUrl, isPrivateIp } from './url-guard.js';

test('classifies private and public IPs', () => {
  const cases: [string, boolean][] = [
    ['127.0.0.1', true], ['10.1.2.3', true], ['172.16.0.1', true], ['172.31.255.255', true], ['172.32.0.1', false],
    ['192.168.1.1', true], ['169.254.169.254', true], ['100.64.0.1', true], ['0.0.0.0', true], ['255.255.255.255', true],
    ['8.8.8.8', false], ['1.1.1.1', false],
    ['::1', true], ['::', true], ['fd00::1', true], ['fe80::1', true], ['::ffff:7f00:1', true], ['::ffff:10.0.0.1', true], ['::ffff:8.8.8.8', false],
    ['2606:4700:4700::1111', false],
  ];
  for (const [ip, expected] of cases) assert.equal(isPrivateIp(ip), expected, ip);
});

test('blocks local, private and tricky URLs; allows public ones', async () => {
  config.allowPrivateUrls = false;
  for (const url of [
    'http://localhost:4000/',
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://2130706433/',
    'http://0x7f.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.1.1/admin',
  ]) {
    await assert.rejects(assertAllowedUrl(url), /private or local address/, url);
  }
  await assert.rejects(assertAllowedUrl('file:///C:/Windows/win.ini'), /Only http\(s\) URLs/);
  await assert.rejects(assertAllowedUrl('http://does-not-exist.invalid/'), /Could not resolve/);
  assert.equal((await assertAllowedUrl('https://8.8.8.8/')).hostname, '8.8.8.8');

  config.allowPrivateUrls = true;
  assert.equal((await assertAllowedUrl('http://localhost:4000/')).hostname, 'localhost');
});

test('the browser cannot reach private addresses after the start page either', async () => {
  const server = createServer((req, res) => {
    const pages: Record<string, string> = {
      '/': '<a href="/internal">Internal</a>',
      '/internal': '<p>secret</p>',
    };
    res.writeHead(200, { 'content-type': 'text/html' }).end(pages[req.url ?? ''] ?? '');
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  config.allowPrivateUrls = true;
  const s = await BrowserSession.open(`${base}/`);
  config.allowPrivateUrls = false;
  try {
    await assert.rejects(s.goto(`${base}/internal`), /private or local address/);

    const fetched = await s.page.evaluate((url) => fetch(url).then(() => 'reached', () => 'blocked'), `${base}/internal`);
    assert.equal(fetched, 'blocked');

    const link = (await s.observe()).elements.find((e) => e.label === 'Internal')!;
    await s.click(link.id);
    assert.ok(!(await s.page.content()).includes('secret'), 'clicking a link must not load a private page');

    assert.ok(!s.networkIssues.some((i) => i.failure?.includes('BLOCKED')));
  } finally {
    config.allowPrivateUrls = true;
    await s.close();
    server.close();
  }
});
