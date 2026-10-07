import { useEffect, useRef } from "react"

import { actionReason, describeAction } from "@/lib/format"
import type { RunStep } from "@/lib/types"
import { cn } from "@/lib/utils"

export function StepList({
  steps,
  activeIndex,
  following,
  running,
  onSelect,
}: {
  steps: RunStep[]
  activeIndex: number
  following: boolean
  running: boolean
  onSelect: (index: number) => void
}) {
  const endRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (!following) return
    const viewport = endRef.current?.closest(
      "[data-slot=scroll-area-viewport]"
    )
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [steps.length, following])

  if (steps.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {running ? "Waiting for the first step." : "No steps were taken."}
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-1 p-1">
      {steps.map((step, i) => {
        const reason = actionReason(step)
        const failed = step.result.startsWith("failed")
        return (
          <li key={step.step}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={i === activeIndex ? "step" : undefined}
              className={cn(
                "flex w-full animate-in gap-3 rounded-lg px-2 py-2 text-left text-sm duration-200 fade-in slide-in-from-bottom-1 hover:bg-muted motion-reduce:animate-none",
                i === activeIndex && "bg-muted"
              )}
            >
              <span className="w-5 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                {step.step}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium break-words">
                  {describeAction(step)}
                </span>
                {reason ? (
                  <span className="text-muted-foreground">{reason}</span>
                ) : null}
                <span
                  className={cn(
                    "text-xs break-all",
                    failed ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {step.result}
                </span>
              </span>
            </button>
          </li>
        )
      })}
      <li ref={endRef} aria-hidden />
    </ol>
  )
}
