import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft"
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight"
import { ImageBrokenIcon } from "@phosphor-icons/react/dist/csr/ImageBroken"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function frameLabel(file: string, index: number) {
  return file === "final.png" ? "End of run" : `Step ${index + 1}`
}

function FrameImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <ImageBrokenIcon className="size-6" aria-hidden />
        Screenshot not available
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="absolute inset-0 size-full animate-in object-contain duration-150 fade-in motion-reduce:animate-none"
    />
  )
}

export function ScreenshotViewer({
  runId,
  frames,
  index,
  running,
  following,
  onSelect,
}: {
  runId: string
  frames: string[]
  index: number
  running: boolean
  following: boolean
  onSelect: (index: number | null) => void
}) {
  const file = frames[index]
  const label = file ? frameLabel(file, index) : null

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl border bg-muted">
        {file && label ? (
          <FrameImage
            key={file}
            src={`/api/runs/${runId}/screenshots/${file}`}
            alt={`Browser screenshot, ${label.toLowerCase()}`}
          />
        ) : (
          <>
            <Skeleton className="absolute inset-0 rounded-none" />
            <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Opening the browser
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous step"
          disabled={index <= 0}
          onClick={() => onSelect(index - 1)}
        >
          <CaretLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next step"
          disabled={index >= frames.length - 1}
          onClick={() => onSelect(index + 1)}
        >
          <CaretRightIcon />
        </Button>
        <span className="font-mono text-sm tabular-nums">
          {label ?? "No screenshots yet"}
        </span>
        <div className="ml-auto">
          {running ? (
            following ? (
              <Badge variant="outline">
                <span
                  className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
                  aria-hidden
                />
                Live
              </Badge>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => onSelect(null)}>
                Back to live
              </Button>
            )
          ) : null}
        </div>
      </div>

      {frames.length > 1 ? (
        <div className="flex gap-0.5" role="group" aria-label="Jump to a step">
          {frames.map((frame, i) => (
            <button
              key={frame}
              type="button"
              aria-label={frameLabel(frame, i)}
              aria-current={i === index ? "step" : undefined}
              onClick={() => onSelect(i)}
              className={cn(
                "h-2 flex-1 rounded-full bg-muted transition-colors hover:bg-muted-foreground/40",
                i === index && "bg-primary hover:bg-primary"
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
