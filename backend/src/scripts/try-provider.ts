import { BrowserSession } from '../browser/session.js';
import { PROVIDERS, type ProviderName } from '../config.js';
import { createProvider } from '../providers/index.js';

const [provider, url, goal = 'Explore the page and look for bugs', model] = process.argv.slice(2);
if (!PROVIDERS.includes(provider as ProviderName) || !url) {
  console.error('Usage: npx tsx src/scripts/try-provider.ts <claude|openai> <url> ["goal"] [model]');
  process.exit(1);
}

const llm = createProvider({ provider: provider as ProviderName, model, apiKey: process.env.QA_API_KEY });
const session = await BrowserSession.open(url);
try {
  const observation = await session.observe();
  console.log(`${llm.name} (${llm.model}) sees ${observation.elements.length} elements on ${observation.url}`);
  console.log(await llm.decide({ goal, observation, history: [] }));
} finally {
  await session.close();
}
