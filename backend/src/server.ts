import { buildApp } from './app.js';
import { config } from './config.js';
import { loadRuns } from './runs/store.js';

const app = await buildApp({ staticDir: config.frontendDir });

try {
  app.log.info(`Loaded ${await loadRuns()} saved run(s) from ${config.reportsDir}`);
  await app.listen({ port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
