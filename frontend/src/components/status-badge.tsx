import type { VariantProps } from "class-variance-authority"

import { Badge, type badgeVariants } from "@/components/ui/badge"
import type { RunStatus } from "@/lib/types"

const STATUS: Record<
  RunStatus,
  { label: string; variant: VariantProps<typeof badgeVariants>["variant"] }
> = {
  running: { label: "Running", variant: "default" },
  finished: { label: "Finished", variant: "success" },
  max_steps: { label: "Step limit", variant: "warning" },
  timeout: { label: "Timed out", variant: "warning" },
  cancelled: { label: "Cancelled", variant: "secondary" },
  error: { label: "Error", variant: "destructive" },
}

export function StatusBadge({ status }: { status: RunStatus }) {
  const { label, variant } = STATUS[status]
  return <Badge variant={variant}>{label}</Badge>
}
