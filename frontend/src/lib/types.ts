export type ProviderName = "claude" | "openai" | "custom"

export interface ProviderInfo {
  name: ProviderName
  label: string
  serverKey: boolean
  defaultModel: string | null
}

export interface ProvidersResponse {
  defaultProvider: ProviderName
  providers: ProviderInfo[]
}

export type RunStatus =
  | "running"
  | "finished"
  | "max_steps"
  | "timeout"
  | "cancelled"
  | "error"

export type Severity = "low" | "medium" | "high" | "critical"

export type AgentAction =
  | { type: "click"; id: number; reason: string }
  | { type: "type"; id: number; text: string; submit: boolean; reason: string }
  | { type: "goto"; url: string; reason: string }
  | { type: "scroll"; direction: "up" | "down"; reason: string }
  | { type: "report_bug"; title: string; severity: Severity; details: string }
  | { type: "finish"; summary: string }

export interface RunStep {
  step: number
  action: AgentAction
  target?: string
  result: string
  screenshot: string
}

export type BugSource =
  | "agent"
  | "console"
  | "network"
  | "accessibility"
  | "broken_link"

export interface Bug {
  source: BugSource
  title: string
  severity: Severity
  details: string
  pageUrl: string
  step: number
  screenshot: string
}

export interface RunDone {
  status: RunStatus
  summary?: string
}

export interface RunRecord {
  id: string
  url: string
  goal: string
  provider: ProviderName
  model: string
  maxSteps: number
  status: RunStatus
  summary?: string
  createdAt: string
  finishedAt?: string
  steps: RunStep[]
  bugs: Bug[]
}

export interface RunSummary {
  id: string
  url: string
  goal: string
  provider: ProviderName
  model: string
  maxSteps: number
  status: RunStatus
  summary?: string
  createdAt: string
  finishedAt?: string
  stepCount: number
  bugCount: number
}
