import { resolve } from 'node:path';
import { buildApp } from '../app.js';
import { config } from '../config.js';
import { loadRuns } from '../runs/store.js';
import { scriptedProvider, startDemoSite } from './fixtures.js';

config.allowPrivateUrls = true;
config.reportsDir = resolve(process.env.REPORTS_DIR || 'reports-demo');
config.serverKeys.claude = 'demo';

const site = await startDemoSite(4100);
const app = await buildApp({
  logger: false,
  staticDir: config.frontendDir,
  createProvider: (req) => scriptedProvider(req.model, 1200),
});
await loadRuns();
await app.listen({ port: config.port });

console.log(`
Demo mode: a scripted AI tests a small buggy shop. No API key needed.

  App:        http://localhost:${config.port}   (run "npm run build" in frontend first)
  Dev UI:     http://localhost:5173             (if "npm run dev" is running in frontend)
  Test this:  ${site.url}

Use model "slow" to try stopping a run. Demo runs are saved in ${config.reportsDir}.
`);
