import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise"
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play"
import { WarningIcon } from "@phosphor-icons/react/dist/csr/Warning"
import { Link, useNavigate } from "react-router"

import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  PROVIDER_LABELS,
  bugLabel,
  formatDateTime,
  formatDuration,
  hostOf,
  timeAgo,
} from "@/lib/format"
import type { RunSummary } from "@/lib/types"
import { useRuns } from "@/lib/use-runs"
import { cn } from "@/lib/utils"

const loadingRows = (
  <div className="flex flex-col gap-2" aria-busy="true">
    <Skeleton className="h-9 w-full" />
    {Array.from({ length: 5 }, (_, i) => (
      <Skeleton key={i} className="h-14 w-full" />
    ))}
  </div>
)

const startLink = (
  <Link to="/" className={buttonVariants()}>
    <PlayIcon weight="fill" data-icon="inline-start" />
    New test
  </Link>
)

function RunsTable({ runs }: { runs: RunSummary[] }) {
  const navigate = useNavigate()

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Website</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Bugs</TableHead>
            <TableHead className="hidden md:table-cell">Steps</TableHead>
            <TableHead className="hidden lg:table-cell">AI</TableHead>
            <TableHead className="hidden sm:table-cell">Started</TableHead>
            <TableHead className="hidden md:table-cell pr-4 text-right">
              Duration
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow
              key={run.id}
              className="cursor-pointer"
              onClick={() => navigate(`/runs/${run.id}`)}
            >
              <TableCell className="pl-4">
                <div className="flex max-w-36 flex-col gap-0.5 sm:max-w-80">
                  <Link
                    to={`/runs/${run.id}`}
                    title={run.url}
                    className="truncate font-mono font-medium underline-offset-4 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {hostOf(run.url)}
                  </Link>
                  <span className="truncate text-muted-foreground" title={run.goal}>
                    {run.goal}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={run.status} />
              </TableCell>
              <TableCell
                className={cn(
                  "tabular-nums",
                  run.bugCount === 0 && "text-muted-foreground"
                )}
              >
                {bugLabel(run.bugCount)}
              </TableCell>
              <TableCell className="hidden font-mono tabular-nums md:table-cell">
                {run.stepCount}/{run.maxSteps}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {PROVIDER_LABELS[run.provider]}{" "}
                <span className="font-mono text-muted-foreground">
                  {run.model}
                </span>
              </TableCell>
              <TableCell
                className="hidden text-muted-foreground sm:table-cell"
                title={formatDateTime(run.createdAt)}
              >
                {timeAgo(run.createdAt)}
              </TableCell>
              <TableCell className="hidden pr-4 text-right font-mono tabular-nums md:table-cell">
                {run.finishedAt
                  ? formatDuration(
                      Date.parse(run.finishedAt) - Date.parse(run.createdAt)
                    )
                  : "running"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function HistoryPage() {
  const { data, error } = useRuns()

  let content
  if (error) {
    content = (
      <Alert variant="destructive">
        <WarningIcon />
        <AlertTitle>Could not load test runs</AlertTitle>
        <AlertDescription>
          <p>{error.message}</p>
          <p>
            If the API is offline, start the backend with npm run dev in the
            backend folder.
          </p>
        </AlertDescription>
      </Alert>
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
          <EmptyTitle>No test runs yet</EmptyTitle>
          <EmptyDescription>
            Start a test and it will show up here with its bugs and report.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>{startLink}</EmptyContent>
      </Empty>
    )
  } else {
    content = <RunsTable runs={data} />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Test runs</h1>
          <p className="text-muted-foreground">
            {data && data.length > 0
              ? `${data.length} ${data.length === 1 ? "run" : "runs"}, newest first.`
              : "Every test you run is kept here with its report."}
          </p>
        </div>
        {data && data.length > 0 ? startLink : null}
      </div>
      {content}
    </div>
  )
}
