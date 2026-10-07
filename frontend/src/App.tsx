import { Navigate, Outlet, Route, Routes } from "react-router"

import { AppHeader } from "@/components/app-header"
import { HistoryPage } from "@/pages/history"
import { NewTestPage } from "@/pages/new-test"
import { RunViewPage } from "@/pages/run-view"

function Layout() {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Outlet />
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
