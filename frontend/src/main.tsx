import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { SWRConfig } from "swr"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { api } from "@/lib/api"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <SWRConfig value={{ fetcher: (path: string) => api(path) }}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SWRConfig>
    </ThemeProvider>
  </StrictMode>
)
