import Anthropic from '@anthropic-ai/sdk';
import { describeState, parseAction, SYSTEM_PROMPT, TOOLS, type AgentAction } from '../agent/tools.js';
import type { DecideInput, LLMProvider } from './types.js';

const CURRENT_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);

export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async decide({ goal, observation, history, signal }: DecideInput): Promise<AgentAction> {
    const current = CURRENT_MODELS.has(this.model);
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters, strict: true })),
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: observation.screenshot.toString('base64') } },
            { type: 'text', text: describeState(goal, observation, history) },
          ],
        },
      ],
      ...(current ? { output_config: { effort: 'medium' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    }, { signal });

    if (res.stop_reason === 'refusal') {
      throw new Error(`Claude declined this step (${res.stop_details?.category ?? 'no category'})`);
    }
    const call = res.content.find((b) => b.type === 'tool_use');
    if (!call) throw new Error('Claude did not choose an action');
    return parseAction(call.name, call.input);
  }
}

export async function validateClaudeKey(apiKey: string): Promise<boolean> {
  try {
    await new Anthropic({ apiKey, maxRetries: 0 }).models.list({ limit: 1 });
    return true;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return false;
    throw err;
  }
}
