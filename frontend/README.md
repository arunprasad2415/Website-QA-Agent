# QA Agent: Frontend

The web app for [QA Agent](../README.md): start a test, watch it run live, and browse past runs.

**Stack:** React 19, TypeScript, Vite, [shadcn/ui](https://ui.shadcn.com) on Base UI, Tailwind CSS v4, SWR, React Router, Phosphor icons, Geist fonts.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173, proxies /api to the backend on :4000
npm run build     # production build in dist/, served by the backend
npm run lint
```

Start the backend first (`npm run dev` or `npm run demo` in `../backend`).

## Pages

| Route | What it shows |
|---|---|
| `/` | New test form: URL, goal suggestions, AI provider (Claude, ChatGPT or a custom OpenAI-compatible API with base URL), your own key with a live key check, model and max steps. Recent runs on the side. |
| `/runs/:id` | Live run: screenshot viewer with a step timeline, steps and bugs tabs, jump from a bug to its screenshot, stop the run, download the report, test again. |
| `/history` | Every run with status, bug count, steps, AI, start time and duration. |

## How it works

- **Live updates** come from the backend's Server-Sent Events (`useRunStream`). The stream replays history on every connection, so a dropped connection never loses or duplicates steps.
- **Data fetching** uses SWR. The run list polls every 3 seconds while a run is active and every 30 seconds otherwise, shared between History and Recent runs.
- **No CORS needed:** Vite proxies `/api` in development, and the backend serves the build in production.
- **Code splitting:** the run page and History load on demand.
- **API keys** stay in component state only. They are never written to `localStorage` or cookies.

## Design

- One cobalt accent on zinc neutrals, light and dark themes following the system (press `d` to toggle).
- Theme colors are CSS variables in `src/index.css`, including `success` and `warning` for run status and bug severity.
- Every view has loading, empty, error and offline states.
- Motion is limited to short opacity and transform transitions (new steps, screenshot crossfade) and turns off for `prefers-reduced-motion`.
- Layouts collapse to one column on phones with no sideways scrolling.

## Structure

```
src/
├── pages/            new-test, run-view, history
├── components/       app header, screenshot viewer, step and bug lists, status badge, ...
│   └── ui/           shadcn/ui components (generated, then customized)
└── lib/              API client, types, formatting, SSE and SWR hooks
```
