import OpenAI from 'openai';
import { describeState, parseAction, SYSTEM_PROMPT, TOOLS, type AgentAction } from '../agent/tools.js';
import type { DecideInput, LLMProvider } from './types.js';

function client(apiKey: string, baseURL?: string, maxRetries?: number): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL,
    maxRetries,
    fetchOptions: baseURL ? { redirect: 'error' } : undefined,
  });
}

export class OpenAIProvider implements LLMProvider {
  readonly name: 'openai' | 'custom';
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly baseURL?: string,
  ) {
    this.name = baseURL ? 'custom' : 'openai';
    this.client = client(apiKey, baseURL);
  }

  async decide({ goal, observation, history, signal }: DecideInput): Promise<AgentAction> {
    const openAIOnly = !this.baseURL;
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: describeState(goal, observation, history) },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${observation.screenshot.toString('base64')}` } },
          ],
        },
      ],
      tools: TOOLS.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters, ...(openAIOnly ? { strict: true } : {}) },
      })),
      tool_choice: 'required',
      ...(openAIOnly ? { parallel_tool_calls: false } : {}),
    }, { signal });

    const label = this.baseURL ? 'The model' : 'OpenAI';
    const msg = res.choices[0]?.message;
    if (msg?.refusal) throw new Error(`${label} declined this step: ${msg.refusal}`);
    const call = msg?.tool_calls?.find((c) => c.type === 'function');
    if (!call) throw new Error(`${label} did not choose an action`);

    let args: unknown;
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      throw new Error(`${label} returned invalid JSON tool arguments`);
    }
    return parseAction(call.function.name, args);
  }
}

export async function validateOpenAIKey(apiKey: string, baseURL?: string): Promise<boolean> {
  try {
    await client(apiKey, baseURL, 0).models.list();
    return true;
  } catch (err) {
    if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) return false;
    throw err;
  }
}
