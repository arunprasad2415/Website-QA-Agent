import { lazy, Suspense } from "react"
import { Navigate, Outlet, Route, Routes } from "react-router"

import { AppHeader } from "@/components/app-header"
import { Skeleton } from "@/components/ui/skeleton"
import { NewTestPage } from "@/pages/new-test"

const RunViewPage = lazy(() =>
  import("@/pages/run-view").then((m) => ({ default: m.RunViewPage }))
)
const HistoryPage = lazy(() =>
  import("@/pages/history").then((m) => ({ default: m.HistoryPage }))
)

const pageFallback = (
  <div className="flex flex-col gap-4" aria-busy="true">
    <Skeleton className="h-8 w-56" />
    <Skeleton className="h-64 w-full rounded-xl" />
  </div>
)

function Layout() {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Suspense fallback={pageFallback}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<NewTestPage />} />
        <Route path="runs/:id" element={<RunViewPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
