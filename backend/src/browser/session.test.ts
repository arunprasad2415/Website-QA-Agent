import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { config } from '../config.js';
import { BrowserSession } from './session.js';

config.allowPrivateUrls = true;

const pages: Record<string, string> = {
  '/': `<h1>Home</h1>
    <a href="/form">Go to form</a>
    <img src="/missing.png" alt="broken">
    <script>console.error('boom')</script>`,
  '/form': `<input name="email" placeholder="Email">
    <input type="password" name="pw" placeholder="Password">
    <button onclick="document.body.insertAdjacentHTML('beforeend', '<p id=ok>Thanks</p>')">Submit</button>`,
};

test('session navigates, clicks, types and captures errors', async () => {
  const server = createServer((req, res) => {
    const body = pages[req.url ?? ''];
    res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' }).end(body ?? 'not found');
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;

  const s = await BrowserSession.open(`http://127.0.0.1:${port}/`);
  try {
    let obs = await s.observe();
    assert.ok(obs.screenshot.length > 0);
    const link = obs.elements.find((e) => e.label === 'Go to form');
    assert.ok(link, 'link should be listed');

    await s.click(link.id);
    assert.match(s.page.url(), /\/form$/);

    obs = await s.observe();
    const byLabel = (label: string) => obs.elements.find((e) => e.label === label)!;
    await s.type(byLabel('Email').id, 'a@b.com');
    await s.type(byLabel('Password').id, 'secret123');
    assert.equal(await s.page.inputValue('input[name=email]'), 'a@b.com');

    obs = await s.observe();
    assert.ok(!JSON.stringify(obs.elements).includes('secret123'));

    await s.click(byLabel('Submit').id);
    assert.equal(await s.page.locator('#ok').textContent(), 'Thanks');

    assert.ok(s.consoleIssues.some((i) => i.message.includes('boom')));
    assert.ok(s.networkIssues.some((i) => i.status === 404 && i.url.endsWith('/missing.png')));

    await assert.rejects(s.click(999), /No element with id 999/);
    await assert.rejects(s.goto('file:///C:/Windows/win.ini'), /Only http\(s\) URLs/);
  } finally {
    await s.close();
    server.close();
  }
});
