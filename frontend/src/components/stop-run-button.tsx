import { StopIcon } from "@phosphor-icons/react/dist/csr/Stop"
import { useState, useTransition } from "react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ApiError, api } from "@/lib/api"

export function StopRunButton({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  function stop() {
    startTransition(async () => {
      try {
        await api(`/api/runs/${runId}/cancel`, { method: "POST" })
        setOpen(false)
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setOpen(false)
          return
        }
        setError(err instanceof Error ? err.message : "Could not stop the run.")
      }
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setError(undefined)
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <StopIcon weight="fill" data-icon="inline-start" />
        Stop run
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop this run?</AlertDialogTitle>
          <AlertDialogDescription>
            The browser closes now. The report keeps every step and bug found so
            far.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep running</AlertDialogCancel>
          <Button variant="destructive" disabled={isPending} onClick={stop}>
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            Stop run
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
