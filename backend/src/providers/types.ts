import type { Observation } from '../browser/session.js';
import type { AgentAction, StepLog } from '../agent/tools.js';
import type { ProviderName } from '../config.js';

export interface DecideInput {
  goal: string;
  observation: Observation;
  history: StepLog[];
  signal?: AbortSignal;
}

export interface LLMProvider {
  readonly name: ProviderName;
  readonly model: string;
  decide(input: DecideInput): Promise<AgentAction>;
}
