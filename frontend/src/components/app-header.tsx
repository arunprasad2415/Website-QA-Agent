import { BugIcon } from "@phosphor-icons/react/dist/csr/Bug"
import { NavLink } from "react-router"
import useSWR from "swr"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"

const NAV_ITEMS = [
  { to: "/", label: "New test", end: true },
  { to: "/history", label: "History", end: false },
]

function ApiStatus() {
  const { data, error } = useSWR("/api/health", { refreshInterval: 10_000 })

  if (error) return <Badge variant="destructive">API offline</Badge>
  if (!data) return <Badge variant="outline">Checking API</Badge>
  return <Badge variant="success">API online</Badge>
}

export function AppHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6">
        <NavLink
          to="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <BugIcon weight="duotone" className="size-5 text-primary" aria-hidden />
          QA Agent
        </NavLink>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                buttonVariants({
                  variant: isActive ? "secondary" : "ghost",
                  size: "sm",
                })
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto">
          <ApiStatus />
        </div>
      </div>
    </header>
  )
}
