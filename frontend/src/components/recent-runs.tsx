import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise"
import { Link } from "react-router"

import { StatusBadge } from "@/components/status-badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { bugLabel, hostOf } from "@/lib/format"
import type { RunSummary } from "@/lib/types"
import { useRuns } from "@/lib/use-runs"

const RECENT_LIMIT = 5

const loadingRows = (
  <div className="flex flex-col gap-2">
    {Array.from({ length: 3 }, (_, i) => (
      <Skeleton key={i} className="h-16 w-full rounded-lg" />
    ))}
  </div>
)

function RecentRunsList({ runs }: { runs: RunSummary[] }) {
  return (
    <ItemGroup className="gap-2">
      {runs.map((run) => (
        <Item
          key={run.id}
          variant="outline"
          render={<Link to={`/runs/${run.id}`} />}
        >
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate font-mono" title={run.url}>
              {hostOf(run.url)}
            </ItemTitle>
            <ItemDescription className="truncate" title={run.goal}>
              {run.goal}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="flex-col items-end gap-1">
            <StatusBadge status={run.status} />
            <span className="text-xs text-muted-foreground">
              {bugLabel(run.bugCount)}
            </span>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  )
}

export function RecentRuns() {
  const { data, error } = useRuns()

  let content
  if (error) {
    content = (
      <p className="text-sm text-muted-foreground">
        Run history is unavailable while the API is offline.
      </p>
    )
  } else if (!data) {
    content = loadingRows
  } else if (data.length === 0) {
    content = (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClockCounterClockwiseIcon />
          </EmptyMedia>
          <EmptyTitle>No runs yet</EmptyTitle>
          <EmptyDescription>Your test runs will appear here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  } else {
    content = <RecentRunsList runs={data.slice(0, RECENT_LIMIT)} />
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="recent-runs">
      <div className="flex items-center justify-between">
        <h2 id="recent-runs" className="text-sm font-medium">
          Recent runs
        </h2>
        {data && data.length > RECENT_LIMIT ? (
          <Link
            to="/history"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            View all runs
          </Link>
        ) : null}
      </div>
      {content}
    </section>
  )
}
