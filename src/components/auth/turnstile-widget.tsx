import * as React from "react"

import { apiFetch } from "@/api/client"

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, options: TurnstileRenderOptions): string
      reset(widgetId: string): void
      remove(widgetId: string): void
    }
  }
}

interface TurnstileRenderOptions {
  sitekey: string
  callback: (token: string) => void
  "expired-callback"?: () => void
  "error-callback"?: () => void
}

interface ConfigResponse {
  turnstileSiteKey: string
}

export interface TurnstileWidgetHandle {
  reset(): void
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js"
let scriptLoadPromise: Promise<void> | null = null

// Module-level singleton: both LoginForm and RegisterForm can mount this
// widget without injecting the script tag twice.
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  scriptLoadPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Failed to load Turnstile"))
    document.head.appendChild(script)
  })
  return scriptLoadPromise
}

function TurnstileWidget({
  onToken,
  ref,
}: {
  onToken: (token: string | null) => void
  ref?: React.Ref<TurnstileWidgetHandle>
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const widgetIdRef = React.useRef<string | null>(null)
  const [siteKey, setSiteKey] = React.useState<string | null>(null)

  React.useEffect(() => {
    apiFetch<ConfigResponse>("/api/config", { skipAuth: true })
      .then((data) => setSiteKey(data.turnstileSiteKey))
      .catch(() => onToken(null))
    // Runs once on mount — the sitekey is static for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (!siteKey || !containerRef.current) return
    let cancelled = false

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        })
      })
      .catch(() => onToken(null))

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey])

  React.useImperativeHandle(ref, () => ({
    reset() {
      // Tokens are single-use — every submit attempt, success or failure,
      // must reset the widget or the next submit replays a spent token.
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current)
      }
      onToken(null)
    },
  }))

  return <div ref={containerRef} data-slot="turnstile-widget" />
}

export { TurnstileWidget }
