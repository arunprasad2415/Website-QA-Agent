import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise"
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft"
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle"
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple"
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass"
import { StopCircleIcon } from "@phosphor-icons/react/dist/csr/StopCircle"
import { WarningIcon } from "@phosphor-icons/react/dist/csr/Warning"
import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import useSWR, { useSWRConfig } from "swr"

import { BugList } from "@/components/bug-list"
import { ElapsedTime } from "@/components/elapsed-time"
import { ScreenshotViewer } from "@/components/screenshot-viewer"
import { StatusBadge } from "@/components/status-badge"
import { StepList } from "@/components/step-list"
import { StopRunButton } from "@/components/stop-run-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api"
import { PROVIDER_LABELS, hostOf } from "@/lib/format"
import type { Bug, RunRecord, RunStatus } from "@/lib/types"
import { useRunStream } from "@/lib/use-run-stream"

const OUTCOME: Record<
  Exclude<RunStatus, "running">,
  { title: string; icon: typeof CheckCircleIcon; tone: string }
> = {
  finished: { title: "Test finished", icon: CheckCircleIcon, tone: "text-success" },
  max_steps: { title: "Stopped at the step limit", icon: WarningIcon, tone: "text-warning" },
  timeout: { title: "Stopped at the time limit", icon: WarningIcon, tone: "text-warning" },
  cancelled: { title: "Run stopped", icon: StopCircleIcon, tone: "text-muted-foreground" },
  error: { title: "Run failed", icon: WarningIcon, tone: "" },
}

function RunOutcome({ status, summary }: { status: Exclude<RunStatus, "running">; summary?: string }) {
  const { title, icon: Icon, tone } = OUTCOME[status]
  return (
    <Alert variant={status === "error" ? "destructive" : "default"}>
      <Icon weight="fill" className={tone} />
      <AlertTitle>{title}</AlertTitle>
      {summary ? <AlertDescription>{summary}</AlertDescription> : null}
    </Alert>
  )
}

function RunNotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MagnifyingGlassIcon />
        </EmptyMedia>
        <EmptyTitle>Run not found</EmptyTitle>
        <EmptyDescription>
          The link may be wrong, or the run was removed from the server.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link to="/history" className={buttonVariants({ variant: "outline" })}>
          View all runs
        </Link>
      </EmptyContent>
    </Empty>
  )
}

const runSkeleton = (
  <div className="flex flex-col gap-6" aria-busy="true">
    <div className="flex flex-col gap-2">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-5 w-96 max-w-full" />
    </div>
    <div className="grid gap-6 lg:grid-cols-12">
      <Skeleton className="aspect-[16/10] rounded-xl lg:col-span-8" />
      <Skeleton className="h-96 rounded-xl lg:col-span-4" />
    </div>
  </div>
)

function RunView({ runId }: { runId: string }) {
  const navigate = useNavigate()
  const { mutate: mutateKey } = useSWRConfig()
  const { data: run, error, mutate } = useSWR<RunRecord>(`/api/runs/${runId}`)
  const stream = useRunStream(runId, () => {
    void mutate()
    void mutateKey("/api/runs")
  })
  const [selected, setSelected] = useState<number | null>(null)

  if (error) {
    return error instanceof ApiError && error.status === 404 ? (
      <RunNotFound />
    ) : (
      <Alert variant="destructive">
        <WarningIcon />
        <AlertTitle>Could not load this run</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    )
  }
  if (!run) return runSkeleton

  const status = stream.done?.status ?? run.status
  const summary = stream.done?.summary ?? run.summary
  const running = status === "running"
  const steps = stream.steps.length >= run.steps.length ? stream.steps : run.steps
  const bugs = stream.bugs.length >= run.bugs.length ? stream.bugs : run.bugs
  const frames = steps.map((s) => s.screenshot)
  if (!running) frames.push("final.png")
  const following = selected === null
  const index = selected ?? frames.length - 1

  function showBug(bug: Bug) {
    const frame = frames.indexOf(bug.screenshot)
    if (frame !== -1) setSelected(frame)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          to="/history"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          All runs
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-3">
              <h1
                className="truncate font-mono text-xl font-semibold tracking-tight"
                title={run.url}
              >
                {hostOf(run.url)}
              </h1>
              <StatusBadge status={status} />
            </div>
            <p className="max-w-[65ch] text-muted-foreground">{run.goal}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="font-mono tabular-nums">
                Step {steps.length} of {run.maxSteps}
              </span>
              <ElapsedTime start={run.createdAt} end={running ? undefined : (run.finishedAt ?? run.createdAt)} />
              <span>
                {PROVIDER_LABELS[run.provider]}{" "}
                <span className="font-mono">{run.model}</span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {running ? (
              <StopRunButton runId={runId} />
            ) : (
              <>
                <a
                  href={`/api/runs/${runId}/report`}
                  download={`qa-report-${runId}.md`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <DownloadSimpleIcon data-icon="inline-start" />
                  Download report
                </a>
                <Button
                  onClick={() => navigate("/", { state: { url: run.url, goal: run.goal } })}
                >
                  <ArrowCounterClockwiseIcon data-icon="inline-start" />
                  Test again
                </Button>
              </>
            )}
          </div>
        </div>
        {running ? null : <RunOutcome status={status as Exclude<RunStatus, "running">} summary={summary} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <ScreenshotViewer
            runId={runId}
            frames={frames}
            index={index}
            running={running}
            following={following}
            onSelect={setSelected}
          />
        </div>
        <Tabs defaultValue="steps" className="lg:col-span-4">
          <TabsList className="w-full">
            <TabsTrigger value="steps">
              Steps
              <span className="font-mono text-xs tabular-nums">{steps.length}</span>
            </TabsTrigger>
            <TabsTrigger value="bugs">
              Bugs
              <Badge variant={bugs.length > 0 ? "destructive" : "secondary"}>
                {bugs.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="steps">
            <ScrollArea className="h-96 rounded-xl border lg:h-[30rem]">
              <StepList
                steps={steps}
                activeIndex={index}
                following={following}
                running={running}
                onSelect={setSelected}
              />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="bugs">
            <ScrollArea className="h-96 rounded-xl border lg:h-[30rem]">
              <BugList bugs={bugs} running={running} onShow={showBug} />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export function RunViewPage() {
  const { id = "" } = useParams()
  return <RunView key={id} runId={id} />
}
