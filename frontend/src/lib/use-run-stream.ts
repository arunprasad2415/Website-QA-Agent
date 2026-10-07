import { useEffect, useEffectEvent, useState } from "react"

import type { Bug, RunDone, RunStep } from "@/lib/types"

export interface RunStream {
  steps: RunStep[]
  bugs: Bug[]
  done: RunDone | null
}

const EMPTY: RunStream = { steps: [], bugs: [], done: null }

export function useRunStream(
  runId: string,
  onDone?: (done: RunDone) => void
): RunStream {
  const [stream, setStream] = useState<RunStream>(EMPTY)
  const handleDone = useEffectEvent((done: RunDone) => onDone?.(done))

  useEffect(() => {
    const source = new EventSource(`/api/runs/${runId}/events`)

    source.onopen = () => setStream(EMPTY)
    source.addEventListener("step", (event) => {
      const step: RunStep = JSON.parse(event.data)
      setStream((s) => ({ ...s, steps: [...s.steps, step] }))
    })
    source.addEventListener("bug", (event) => {
      const bug: Bug = JSON.parse(event.data)
      setStream((s) => ({ ...s, bugs: [...s.bugs, bug] }))
    })
    source.addEventListener("done", (event) => {
      const done: RunDone = JSON.parse(event.data)
      source.close()
      setStream((s) => ({ ...s, done }))
      handleDone(done)
    })

    return () => source.close()
  }, [runId])

  return stream
}
