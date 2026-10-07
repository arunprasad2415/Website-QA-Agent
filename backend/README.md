# Website QA Agent: Backend

An autonomous QA tester for websites. Give it a URL and a goal ("test the signup flow"). An AI model (Claude or ChatGPT) drives a real Chromium browser through Playwright: it reads screenshots, clicks, types, and navigates toward the goal. Automatic checks catch console errors, failed requests, broken links and accessibility problems along the way. Each run ends with a Markdown bug report with screenshots and steps to reproduce.

**Stack:** Node.js 22, TypeScript, Fastify, Playwright, Anthropic SDK, OpenAI SDK

## How it works

```
            ┌──────────── repeat until finished / step limit / timeout / cancel ────────────┐
URL + goal → │ observe: screenshot + numbered clickable elements                               │
            │ check:   console errors, failed requests, broken links, accessibility          │
            │ decide:  Claude or ChatGPT picks ONE action (click, type, goto, scroll,        │
            │          report_bug, finish), validated before it runs                        │
            │ act:     Playwright performs it; failures are fed back to the AI               │
            └───────────────────────────────────────────────────────────────────────────────┘
            → live events (SSE) → run.json + report.md + screenshots
```

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env      # Windows: copy .env.example .env
npm run dev               # http://localhost:4000
```

## AI providers: server key or BYOK

| Mode | How |
|---|---|
| Claude (server key) | Set `ANTHROPIC_API_KEY` in `.env` |
| ChatGPT (server key) | Set `OPENAI_API_KEY` and `OPENAI_DEFAULT_MODEL` (a model that supports images and function calling) in `.env` |
| BYOK (bring your own key) | Send `"apiKey"` with `POST /api/runs` |

The key is chosen in this order: the request's `apiKey`, then the server key for that provider. If neither exists, the request gets a `400`.
**BYOK keys are kept in memory only for that run. They are never saved to disk, written to reports, returned by the API or logged.** Tests verify this.

Claude requests use Anthropic's server-side refusal fallback (`fallbacks: "default"`): if Claude's safety classifier declines a step, the API retries it on Anthropic's recommended fallback model.

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | none | Optional server keys |
| `DEFAULT_PROVIDER` | `claude` | `claude` or `openai` |
| `CLAUDE_DEFAULT_MODEL` | `claude-opus-5-5` | Overridable per run with `"model"` |
| `OPENAI_DEFAULT_MODEL` | none | Required for ChatGPT unless sent per run |
| `MAX_CONCURRENT_RUNS` | `2` | Each run is a full browser. More runs get a `429`. |
| `RUN_TIMEOUT_MS` | `300000` | Hard time limit per run |
| `ALLOW_PRIVATE_URLS` | `false` | `true` only for testing your own `localhost` sites |
| `HEADLESS` | `true` | `false` shows the browser window, useful for demos |
| `REPORTS_DIR` | `./reports` | Where runs are stored |

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/providers` | Providers, whether a server key is set, default models (never the keys) |
| POST | `/api/keys/validate` | `{provider, apiKey}` → `{valid}`. Uses no tokens. |
| POST | `/api/runs` | Start a run → `202 {runId}` |
| GET | `/api/runs` | Past runs, newest first (summary only) |
| GET | `/api/runs/:id` | Full run: steps, bugs, status, summary |
| GET | `/api/runs/:id/events` | Live Server-Sent Events: `step`, `bug`, `done` (replays history first) |
| GET | `/api/runs/:id/report` | Markdown bug report (partial while running) |
| GET | `/api/runs/:id/screenshots/:file` | `step-01.png` … `final.png` |
| POST | `/api/runs/:id/cancel` | Stop a running test |

### Example

```bash
curl -X POST http://localhost:4000/api/runs \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com","goal":"Explore the site and look for bugs","provider":"claude","maxSteps":15}'
# → {"runId":"6f1c..."}

curl -N http://localhost:4000/api/runs/6f1c.../events     # watch live
curl http://localhost:4000/api/runs/6f1c.../report        # Markdown report
```

`POST /api/runs` body: `url` and `goal` are required. `provider` (`claude` | `openai`), `model`, `apiKey` (BYOK) and `maxSteps` (1–50, default 25) are optional.

Try a provider without the server: `npx tsx src/scripts/try-provider.ts claude https://example.com "Find the main link"`

## What it detects

| Source | Examples |
|---|---|
| AI tester | Broken or overlapping UI, buttons that do nothing, wrong behavior, missing validation, confusing UX |
| Console | JavaScript errors and uncaught exceptions |
| Network | 4xx/5xx responses, failed requests (a page that fails to load is high severity) |
| Links | Same-origin links returning 404/410/5xx |
| Accessibility | Images without alt text, unlabeled form fields, buttons/links with no name, missing `lang` or `<title>` |

## Security

- **SSRF protection:** the agent visits URLs other people supply, so it refuses `localhost`, private networks (10.x, 172.16–31.x, 192.168.x), link-local and cloud metadata (`169.254.169.254`), IPv6 local ranges, and disguised forms (`2130706433`, `0x7f.1`, `[::ffff:127.0.0.1]`). The check applies to **every** request the browser makes (navigation, clicks, redirects, images, `fetch`), not only the start URL. Service workers are blocked, and the link checker doesn't follow redirects.
- **Untrusted model output:** every AI action is validated against the tool schema before it runs.
- **Prompt injection:** the AI is told that website text is data, not instructions. It can only use the six browser actions.
- **Safe link checking:** links are checked from a separate cookie-less context, so checking a "Logout" or "Delete" link can't act as the logged-in user.
- **Report escaping:** text from websites and the AI is escaped in reports, so it can't inject HTML, tracking images or break the layout.
- **Path safety:** screenshot file names are strictly validated, so nothing like `../run.json` can be read.
- **Input validation:** JSON schemas on every route, plus limits on steps, run time and concurrent runs.

**Known limits:** DNS rebinding could in theory get past the per-request DNS check, and WebSockets aren't routed through the guard. For a public deployment, also run the server behind an egress firewall that blocks private ranges.

## Tests

```bash
npm test          # 18 tests: browser, agent loop, API, reports, SSRF guard
npm run typecheck
```

The tests use a local buggy test site and a scripted fake AI, so **they need no API key and make no paid calls**.

## Project structure

```
src/
├── server.ts / app.ts      # Fastify setup
├── config.ts               # .env loading + validation
├── agent/
│   ├── loop.ts             # observe → decide → act loop
│   ├── tools.ts            # Shared AI actions, prompt, output validation
│   └── checks.ts           # Automatic bug checks
├── browser/
│   ├── session.ts          # Playwright wrapper
│   └── url-guard.ts        # SSRF protection
├── providers/              # Claude + OpenAI behind one interface, BYOK key resolution
├── routes/                 # /api/providers, /api/runs
├── runs/store.ts           # Run state, live events, JSON persistence
└── report/markdown.ts      # Bug report
```

## Limitations / next steps

- Single tab: links that open a new tab aren't followed.
- Runs are kept in memory plus JSON files. Move to SQLite when history grows or you run more than one server.
- No user accounts: BYOK covers per-user billing.
- No login handling for sites behind authentication.
