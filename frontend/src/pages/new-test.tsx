import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle"
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye"
import { EyeSlashIcon } from "@phosphor-icons/react/dist/csr/EyeSlash"
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play"
import { WarningIcon } from "@phosphor-icons/react/dist/csr/Warning"
import { useState, useTransition, type FormEvent } from "react"
import { useLocation, useNavigate } from "react-router"
import useSWR from "swr"

import { RecentRuns } from "@/components/recent-runs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ApiError, api } from "@/lib/api"
import { normalizeUrl } from "@/lib/format"
import type {
  ProviderInfo,
  ProviderName,
  ProvidersResponse,
} from "@/lib/types"

const GOAL_PRESETS = [
  "Explore the site and look for bugs",
  "Test the signup flow",
  "Test the search feature",
  "Test the contact form",
]
const DEFAULT_MAX_STEPS = 25
const BASE_URL_PRESETS = [
  { label: "OpenRouter", url: "https://openrouter.ai/api/v1" },
  { label: "Groq", url: "https://api.groq.com/openai/v1" },
  { label: "Together", url: "https://api.together.xyz/v1" },
  {
    label: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  { label: "Mistral", url: "https://api.mistral.ai/v1" },
]

type FormErrors = Partial<
  Record<"url" | "goal" | "baseUrl" | "apiKey" | "model" | "form", string>
>

const JSON_HEADERS = { "content-type": "application/json" }

function errorsFromApi(err: unknown): FormErrors {
  if (!(err instanceof ApiError)) {
    return { form: "Could not reach the API. Is the backend running?" }
  }
  const { message, status } = err
  if (status === 429) return { form: message }
  if (/base url|baseUrl/i.test(message))
    return { baseUrl: message.replace(/^Invalid base URL: /, "") }
  if (/^body\/url|url|address|resolve host/i.test(message))
    return { url: message.replace(/^Invalid url: /, "") }
  if (/^body\/goal/i.test(message)) return { goal: message }
  if (/api key|apiKey/i.test(message)) return { apiKey: message }
  if (/model/i.test(message)) return { model: message }
  return { form: message }
}

function ProviderField({
  providers,
  selected,
  onChange,
}: {
  providers: ProviderInfo[] | undefined
  selected: ProviderInfo | undefined
  onChange: (name: ProviderName) => void
}) {
  return (
    <Field>
      <FieldTitle id="provider-label">AI model</FieldTitle>
      {providers && selected ? (
        <>
          <ToggleGroup
            aria-labelledby="provider-label"
            variant="choice"
            className="flex-wrap"
            value={[selected.name]}
            onValueChange={(value) => {
              const next = value[0] as ProviderName | undefined
              if (next) onChange(next)
            }}
          >
            {providers.map((provider) => (
              <ToggleGroupItem key={provider.name} value={provider.name}>
                {provider.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>
            {selected.name === "custom"
              ? "Any OpenAI-compatible API with your own key. The model must accept images and tool calls."
              : selected.serverKey
                ? "Uses the server's API key unless you add your own below."
                : "This server has no key for it, so add your own below."}
          </FieldDescription>
        </>
      ) : (
        <Skeleton className="h-8 w-72" />
      )}
    </Field>
  )
}

type KeyCheck = {
  provider: ProviderName
  key: string
  baseUrl: string
  result: "valid" | "invalid" | "error"
  message?: string
}

function BaseUrlField({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="base-url">Base URL</FieldLabel>
      <Input
        id="base-url"
        inputMode="url"
        spellCheck={false}
        placeholder="https://openrouter.ai/api/v1"
        className="font-mono"
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {BASE_URL_PRESETS.map((preset) => (
          <Button
            key={preset.url}
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onChange(preset.url)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        <FieldDescription>
          The API address that goes before /chat/completions. Private network
          addresses are blocked unless the server allows them.
        </FieldDescription>
      )}
    </Field>
  )
}

function ApiKeyField({
  provider,
  baseUrl,
  value,
  onChange,
  error,
}: {
  provider: ProviderInfo | undefined
  baseUrl: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const [visible, setVisible] = useState(false)
  const [check, setCheck] = useState<KeyCheck | null>(null)
  const [isChecking, startCheck] = useTransition()
  const [checkError, setCheckError] = useState<string>()

  const key = value.trim()
  const isCustom = provider?.name === "custom"
  const checkedBaseUrl = isCustom ? baseUrl.trim() : ""
  const status =
    check &&
    provider &&
    check.provider === provider.name &&
    check.key === key &&
    check.baseUrl === checkedBaseUrl
      ? check
      : null
  const required = provider ? !provider.serverKey : false
  const shownError =
    error ??
    checkError ??
    (status?.result === "invalid"
      ? `${isCustom ? "The API" : provider?.label} rejected this key.`
      : status?.result === "error"
        ? status.message
        : undefined)

  function handleCheck() {
    if (!provider) return
    if (!key) {
      setCheckError("Enter a key to check it.")
      return
    }
    if (isCustom && !checkedBaseUrl) {
      setCheckError("Enter the base URL first.")
      return
    }
    setCheckError(undefined)
    const name = provider.name
    const base = checkedBaseUrl
    startCheck(async () => {
      try {
        const { valid } = await api<{ valid: boolean }>("/api/keys/validate", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            provider: name,
            apiKey: key,
            baseUrl: base || undefined,
          }),
        })
        setCheck({
          provider: name,
          key,
          baseUrl: base,
          result: valid ? "valid" : "invalid",
        })
      } catch (err) {
        setCheck({
          provider: name,
          key,
          baseUrl: base,
          result: "error",
          message: err instanceof Error ? err.message : "Could not check the key.",
        })
      }
    })
  }

  return (
    <Field data-invalid={shownError ? true : undefined}>
      <FieldLabel htmlFor="api-key">
        {required ? "API key" : "Your own API key (optional)"}
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          id="api-key"
          type={visible ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          value={value}
          aria-invalid={shownError ? true : undefined}
          onChange={(event) => {
            setCheckError(undefined)
            onChange(event.target.value)
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={visible ? "Hide key" : "Show key"}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeSlashIcon /> : <EyeIcon />}
          </InputGroupButton>
          <InputGroupButton
            variant="secondary"
            disabled={isChecking}
            onClick={handleCheck}
          >
            {isChecking ? <Spinner data-icon="inline-start" /> : null}
            Check key
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {shownError ? (
        <FieldError>{shownError}</FieldError>
      ) : status?.result === "valid" ? (
        <FieldDescription className="flex items-center gap-1.5 text-success">
          <CheckCircleIcon weight="fill" aria-hidden />
          Key works.
        </FieldDescription>
      ) : (
        <FieldDescription>
          Kept in this tab only. It is sent to your backend for this run and
          never stored.
        </FieldDescription>
      )}
    </Field>
  )
}

function NewTestForm() {
  const navigate = useNavigate()
  const prefill = useLocation().state as { url?: string; goal?: string } | null
  const { data: providers } = useSWR<ProvidersResponse>("/api/providers")
  const { error: healthError } = useSWR("/api/health", {
    refreshInterval: 10_000,
  })

  const [url, setUrl] = useState(() => prefill?.url ?? "")
  const [goal, setGoal] = useState(() => prefill?.goal ?? "")
  const [providerName, setProviderName] = useState<ProviderName | null>(null)
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("")
  const [maxSteps, setMaxSteps] = useState(DEFAULT_MAX_STEPS)
  const [errors, setErrors] = useState<FormErrors>({})
  const [isPending, startTransition] = useTransition()

  const selectedName = providerName ?? providers?.defaultProvider
  const provider = providers?.providers.find((p) => p.name === selectedName)
  const isCustom = provider?.name === "custom"
  const offline = Boolean(healthError)

  function clearError(field: keyof FormErrors) {
    setErrors((current) =>
      current[field] || current.form
        ? { ...current, [field]: undefined, form: undefined }
        : current
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!provider) return

    const target = normalizeUrl(url)
    const apiBase = isCustom ? normalizeUrl(baseUrl) : null
    const found: FormErrors = {}
    if (isCustom && !baseUrl.trim())
      found.baseUrl = "Enter the API base URL, or pick one below."
    else if (isCustom && !apiBase)
      found.baseUrl = "Enter a web address, for example https://openrouter.ai/api/v1."
    if (!url.trim()) found.url = "Enter the website to test."
    else if (!target)
      found.url = "Enter a web address, for example https://example.com."
    if (!goal.trim()) found.goal = "Describe what the AI should test."
    if (!provider.serverKey && !apiKey.trim())
      found.apiKey = `Add your ${provider.label} API key to use it.`
    if (!provider.defaultModel && !model.trim())
      found.model = "Enter a model name. This server has no default for it."
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }

    startTransition(async () => {
      try {
        const { runId } = await api<{ runId: string }>("/api/runs", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            url: target,
            goal: goal.trim(),
            provider: provider.name,
            model: model.trim() || undefined,
            apiKey: apiKey.trim() || undefined,
            baseUrl: apiBase ?? undefined,
            maxSteps,
          }),
        })
        navigate(`/runs/${runId}`)
      } catch (err) {
        setErrors(errorsFromApi(err))
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {offline ? (
        <Alert variant="destructive">
          <WarningIcon />
          <AlertTitle>The API is offline</AlertTitle>
          <AlertDescription>
            Start the backend with npm run dev in the backend folder. This page
            reconnects on its own.
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset disabled={offline || isPending} className="contents">
        <FieldGroup>
          <Field data-invalid={errors.url ? true : undefined}>
            <FieldLabel htmlFor="url">Website URL</FieldLabel>
            <Input
              id="url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.com"
              className="font-mono"
              value={url}
              aria-invalid={errors.url ? true : undefined}
              onChange={(event) => {
                setUrl(event.target.value)
                clearError("url")
              }}
            />
            {errors.url ? (
              <FieldError>{errors.url}</FieldError>
            ) : (
              <FieldDescription>
                Public websites only. Local and private network addresses are
                blocked.
              </FieldDescription>
            )}
          </Field>

          <Field data-invalid={errors.goal ? true : undefined}>
            <FieldLabel htmlFor="goal">What should it test?</FieldLabel>
            <Textarea
              id="goal"
              rows={2}
              maxLength={1000}
              value={goal}
              aria-invalid={errors.goal ? true : undefined}
              onChange={(event) => {
                setGoal(event.target.value)
                clearError("goal")
              }}
            />
            <div className="flex flex-wrap gap-2">
              {GOAL_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setGoal(preset)
                    clearError("goal")
                  }}
                >
                  {preset}
                </Button>
              ))}
            </div>
            {errors.goal ? <FieldError>{errors.goal}</FieldError> : null}
          </Field>

          <ProviderField
            providers={providers?.providers}
            selected={provider}
            onChange={(name) => {
              setProviderName(name)
              setErrors({})
            }}
          />

          {isCustom ? (
            <BaseUrlField
              value={baseUrl}
              onChange={(value) => {
                setBaseUrl(value)
                clearError("baseUrl")
              }}
              error={errors.baseUrl}
            />
          ) : null}

          <ApiKeyField
            provider={provider}
            baseUrl={baseUrl}
            value={apiKey}
            onChange={(value) => {
              setApiKey(value)
              clearError("apiKey")
            }}
            error={errors.apiKey}
          />

          <Field data-invalid={errors.model ? true : undefined}>
            <FieldLabel htmlFor="model">
              {provider && !provider.defaultModel ? "Model" : "Model (optional)"}
            </FieldLabel>
            <Input
              id="model"
              spellCheck={false}
              className="font-mono"
              placeholder={provider?.defaultModel ?? ""}
              value={model}
              aria-invalid={errors.model ? true : undefined}
              onChange={(event) => {
                setModel(event.target.value)
                clearError("model")
              }}
            />
            {errors.model ? (
              <FieldError>{errors.model}</FieldError>
            ) : (
              <FieldDescription>
                {provider?.defaultModel
                  ? `Leave empty to use ${provider.defaultModel}.`
                  : "Use a model that accepts images and tool calls."}
              </FieldDescription>
            )}
          </Field>

          <Field>
            <div className="flex items-center justify-between">
              <FieldTitle id="steps-label">Max steps</FieldTitle>
              <span className="font-mono text-sm tabular-nums">{maxSteps}</span>
            </div>
            <Slider
              aria-labelledby="steps-label"
              min={5}
              max={50}
              step={1}
              value={[maxSteps]}
              onValueChange={(value) =>
                setMaxSteps(Array.isArray(value) ? value[0] : value)
              }
            />
            <FieldDescription>
              Each step is one action in the browser. More steps test deeper
              and cost more.
            </FieldDescription>
          </Field>
        </FieldGroup>

        {errors.form ? (
          <Alert variant="destructive">
            <WarningIcon />
            <AlertTitle>Could not start the test</AlertTitle>
            <AlertDescription>{errors.form}</AlertDescription>
          </Alert>
        ) : null}

        <div>
          <Button type="submit" size="lg" disabled={!provider}>
            {isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PlayIcon weight="fill" data-icon="inline-start" />
            )}
            {isPending ? "Starting test" : "Start test"}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

export function NewTestPage() {
  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <section className="flex flex-col gap-8 lg:col-span-7">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Test a website
          </h1>
          <p className="max-w-[65ch] text-muted-foreground">
            An AI model clicks through your site in a real browser and reports
            what breaks, with screenshots and steps to reproduce.
          </p>
        </div>
        <NewTestForm />
      </section>
      <aside className="lg:col-span-5">
        <RecentRuns />
      </aside>
    </div>
  )
}
