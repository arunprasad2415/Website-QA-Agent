import { useEffect, useState } from "react"

import { formatDuration } from "@/lib/format"

export function ElapsedTime({ start, end }: { start: string; end?: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (end) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [end])

  const elapsed = (end ? Date.parse(end) : now) - Date.parse(start)
  return (
    <span className="font-mono tabular-nums">{formatDuration(elapsed)}</span>
  )
}
