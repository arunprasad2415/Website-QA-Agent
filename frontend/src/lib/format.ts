import type {
  BugSource,
  ProviderName,
  RunStep,
  Severity,
} from "@/lib/types"

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  claude: "Claude",
  openai: "ChatGPT",
  custom: "Custom API",
}

export const SOURCE_LABELS: Record<BugSource, string> = {
  agent: "AI tester",
  console: "Console check",
  network: "Network check",
  accessibility: "Accessibility check",
  broken_link: "Link check",
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"]

export function describeAction({ action, target }: RunStep): string {
  const element = (id: number) => `"${target || `element #${id}`}"`
  switch (action.type) {
    case "click":
      return `Click ${element(action.id)}`
    case "type":
      return `Type "${action.text}" into ${element(action.id)}${action.submit ? " and press Enter" : ""}`
    case "goto":
      return `Go to ${action.url}`
    case "scroll":
      return `Scroll ${action.direction}`
    case "report_bug":
      return `Report bug: ${action.title}`
    case "finish":
      return "Finish testing"
  }
}

export function actionReason({ action }: RunStep): string | undefined {
  return "reason" in action ? action.reason : undefined
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return `${minutes}:${seconds}`
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
]

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Date.parse(iso) - now
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) return RELATIVE.format(Math.round(diff / ms), unit)
  }
  return "just now"
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

export function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function bugLabel(count: number) {
  if (count === 0) return "No bugs"
  return count === 1 ? "1 bug" : `${count} bugs`
}

export function normalizeUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`
  try {
    const url = new URL(withScheme)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null
  } catch {
    return null
  }
}
