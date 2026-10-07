import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import type { AgentAction } from '../agent/tools.js';
import type { Observation } from '../browser/session.js';
import type { LLMProvider } from '../providers/types.js';

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><title>${title}</title><style>body{font-family:system-ui;margin:0}nav{display:flex;gap:16px;padding:16px 32px;background:#0f172a}nav a{color:#fff}main{padding:48px 32px;max-width:720px}h1{font-size:40px}button{padding:10px 16px;font-size:16px}input{display:block;margin:8px 0 16px;padding:8px;width:320px}</style></head><body><nav><a href="/">Home</a><a href="/pricing">Pricing</a><a href="/signup">Sign up</a><a href="/blog">Blog</a></nav><main>${body}</main></body></html>`;

const PAGES: Record<string, string> = {
  '/': page('Demo Shop', '<h1>Welcome to the demo shop</h1><p>Fast checkout, friendly support.</p><img src="/hero.png"><p><a href="/signup">Create an account</a></p><script>console.error("Analytics failed to load")</script>'),
  '/pricing': page('Pricing', '<h1>Pricing</h1><p>Starter: $9/mo</p><p>Pro: $29/mo</p><button>Choose Pro</button>'),
  '/signup': page('Sign up', '<h1>Create your account</h1><input placeholder="Email"><input type="password" placeholder="Password"><button>Create account</button>'),
};

export async function startDemoSite(port = 0): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const body = PAGES[req.url ?? ''];
    res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' }).end(body ?? 'not found');
  }).listen(port, '127.0.0.1');
  await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` };
}

const find = (obs: Observation, label: string) => obs.elements.find((e) => e.label === label)?.id ?? 0;

const SCRIPT: ((obs: Observation) => AgentAction)[] = [
  (o) => ({ type: 'click', id: find(o, 'Pricing'), reason: 'Check the pricing page first' }),
  (o) => ({ type: 'click', id: find(o, 'Choose Pro'), reason: 'Try to pick a plan' }),
  () => ({ type: 'report_bug', title: 'Choose Pro button does nothing', severity: 'high', details: 'Clicked "Choose Pro" on /pricing. Expected a checkout or signup step, nothing happened and no message was shown.' }),
  (o) => ({ type: 'click', id: find(o, 'Sign up'), reason: 'Open the signup form' }),
  (o) => ({ type: 'type', id: find(o, 'Email'), text: 'qa.tester@example.com', submit: false, reason: 'Fill in a test email' }),
  (o) => ({ type: 'type', id: find(o, 'Password'), text: 'Sup3r-secret!', submit: false, reason: 'Fill in a password' }),
  (o) => ({ type: 'click', id: find(o, 'Create account'), reason: 'Submit the form' }),
  () => ({ type: 'report_bug', title: 'Signup gives no feedback after submit', severity: 'medium', details: 'After clicking "Create account" the page stays the same. No success message, no validation errors.' }),
  () => ({ type: 'finish', summary: 'Pricing and signup tested. Two broken interactions found, plus automatic checks.' }),
];

export function scriptedProvider(model: string | undefined, stepDelayMs: number): LLMProvider {
  let turn = 0;
  const endless = model === 'slow';
  return {
    name: 'claude',
    model: endless ? 'demo-endless' : 'demo-scripted',
    decide: async ({ observation, signal }) => {
      await sleep(stepDelayMs, undefined, { signal });
      if (endless) return { type: 'scroll', direction: turn++ % 2 ? 'up' : 'down', reason: 'Keep looking around' };
      return SCRIPT[Math.min(turn++, SCRIPT.length - 1)](observation);
    },
  };
}
