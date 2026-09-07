import * as React from "react"
import { cn } from "cn"

import { apiFetch, getLastHeaders, subscribeHeaders, type DevBoardHeaders } from "@/api/client"
import type { ConnectionState, EntityMessage, PresenceMember } from "@/hooks/useRealtime"

interface InfoResponse {
  colo: string
  region: string | null
  environment: string
  executedAt: string
}

const CACHE_PILL_STYLES: Record<NonNullable<DevBoardHeaders["cache"]>, string> = {
  HIT: "bg-primary text-primary-foreground",
  MISS: "border border-border bg-muted text-muted-foreground",
  BYPASS: "border border-dashed border-border bg-muted text-muted-foreground",
}

const CONNECTION_DOT_STYLES: Record<ConnectionState, string> = {
  connected: "bg-emerald-500",
  reconnecting: "bg-amber-500",
  offline: "border border-muted-foreground bg-transparent",
}

interface CloudflareBarProps extends React.ComponentProps<"div"> {
  projectId?: string | null
  connectionState?: ConnectionState
  presence?: PresenceMember[]
  subscribe?: (handler: (message: EntityMessage) => void) => () => void
}

function CloudflareBar({ className, projectId, connectionState, presence, subscribe, ...props }: CloudflareBarProps) {
  const [headers, setHeaders] = React.useState<DevBoardHeaders>(getLastHeaders)
  const [isPurging, setIsPurging] = React.useState(false)
  const [queueLagSeconds, setQueueLagSeconds] = React.useState<number | null>(null)

  React.useEffect(() => subscribeHeaders(setHeaders), [])

  React.useEffect(() => {
    if (!subscribe) return
    return subscribe((message) => {
      if (message.type === "activity.created") {
        setQueueLagSeconds(Math.max(0, message.activity.processedAt - message.activity.occurredAt))
      }
    })
  }, [subscribe])

  React.useEffect(() => {
    apiFetch<InfoResponse>("/api/info").catch(() => {
      // Inspector bar degrades to whatever it already had — never throws to the shell.
    })
  }, [])

  const isLocal = headers.colo === "LOCAL"

  const handlePurge = async () => {
    if (!projectId) return
    setIsPurging(true)
    try {
      await apiFetch(`/api/projects/${projectId}/cache/purge`, { method: "POST" })
    } catch {
      // Purge is a convenience action — a failure here isn't worth surfacing.
    } finally {
      setIsPurging(false)
    }
  }

  return (
    <div
      data-slot="cloudflare-bar"
      className={cn(
        "flex h-8 shrink-0 items-center gap-3 overflow-x-auto border-b border-border bg-muted px-3 text-xs",
        className,
      )}
      {...props}
    >
      <span
        className={cn("flex w-20 shrink-0 items-center gap-1 tabular-nums", isLocal && "text-muted-foreground")}
        title={isLocal ? "Running locally — no colo assigned" : `Served from ${headers.colo}`}
      >
        ⚡ {headers.colo}
      </span>
      <span className="w-16 shrink-0 tabular-nums" title="Round-trip duration">
        {headers.durationMs !== null ? `${headers.durationMs}ms` : "—"}
      </span>
      {headers.cache && (
        <span
          className={cn("shrink-0 rounded px-1.5 py-0.5 font-medium", CACHE_PILL_STYLES[headers.cache])}
          title="KV cache status for the last request"
        >
          {headers.cache}
        </span>
      )}
      {queueLagSeconds !== null && (
        <span
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-muted-foreground tabular-nums"
          title="The last activity took this long to process asynchronously"
        >
          Q +{queueLagSeconds}s
        </span>
      )}
      {connectionState && (
        <span
          className="flex shrink-0 items-center gap-1"
          title={presence?.length ? presence.map((p) => p.displayName).join(", ") : undefined}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", CONNECTION_DOT_STYLES[connectionState])} />
          {connectionState === "connected" ? `${presence?.length ?? 0} live` : connectionState}
        </span>
      )}
      {projectId && (
        <button
          type="button"
          onClick={handlePurge}
          disabled={isPurging}
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {isPurging ? "Purging…" : "Purge cache"}
        </button>
      )}
    </div>
  )
}

export { CloudflareBar }
