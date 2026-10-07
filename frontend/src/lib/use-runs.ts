import useSWR from "swr"

import type { RunSummary } from "@/lib/types"

export function useRuns() {
  return useSWR<RunSummary[]>("/api/runs", {
    refreshInterval: (runs) =>
      runs?.some((run) => run.status === "running") ? 3000 : 30_000,
  })
}
