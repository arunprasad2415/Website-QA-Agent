import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { SEVERITY_ORDER, SOURCE_LABELS } from "@/lib/format"
import type { Bug, Severity } from "@/lib/types"

const SEVERITY_BADGE: Record<
  Severity,
  { label: string; variant: "destructive" | "warning" | "secondary" }
> = {
  critical: { label: "Critical", variant: "destructive" },
  high: { label: "High", variant: "destructive" },
  medium: { label: "Medium", variant: "warning" },
  low: { label: "Low", variant: "secondary" },
}

function bugKey(bug: Bug) {
  return `${bug.source}|${bug.step}|${bug.title}|${bug.details.slice(0, 60)}`
}

function BugItem({ bug, onShow }: { bug: Bug; onShow: (bug: Bug) => void }) {
  const severity = SEVERITY_BADGE[bug.severity]
  const where = bug.screenshot === "final.png" ? "end of run" : `step ${bug.step}`

  return (
    <li className="flex animate-in flex-col gap-2 rounded-lg border p-3 duration-200 fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
      <div className="flex items-start gap-2">
        <Badge variant={severity.variant} className="mt-0.5">
          {severity.label}
        </Badge>
        <p className="text-sm font-medium break-words">{bug.title}</p>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{SOURCE_LABELS[bug.source]}</span>
        <Button variant="link" size="xs" onClick={() => onShow(bug)}>
          View {where}
        </Button>
      </div>
      <Collapsible>
        <CollapsibleTrigger
          render={<Button variant="ghost" size="xs" className="-ml-2" />}
        >
          Details
          <CaretDownIcon data-icon="inline-end" />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-2 pt-2">
          <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-xs break-words whitespace-pre-wrap">
            {bug.details}
          </pre>
          <p className="font-mono text-xs break-all text-muted-foreground">
            {bug.pageUrl}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

export function BugList({
  bugs,
  running,
  onShow,
}: {
  bugs: Bug[]
  running: boolean
  onShow: (bug: Bug) => void
}) {
  if (bugs.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {running ? "No bugs found yet." : "No bugs found in this run."}
      </p>
    )
  }

  const sorted = bugs.toSorted(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.step - b.step
  )

  return (
    <ul className="flex flex-col gap-2 p-1">
      {sorted.map((bug) => (
        <BugItem key={bugKey(bug)} bug={bug} onShow={onShow} />
      ))}
    </ul>
  )
}
