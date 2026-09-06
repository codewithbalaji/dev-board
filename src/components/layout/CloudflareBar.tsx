import * as React from "react"
import { cn } from "cn"

import { apiFetch, getLastHeaders, subscribeHeaders, type DevBoardHeaders } from "@/api/client"

interface InfoResponse {
  colo: string
  region: string | null
  environment: string
  executedAt: string
}

function CloudflareBar({ className, ...props }: React.ComponentProps<"div">) {
  const [headers, setHeaders] = React.useState<DevBoardHeaders>(getLastHeaders)

  React.useEffect(() => subscribeHeaders(setHeaders), [])

  React.useEffect(() => {
    apiFetch<InfoResponse>("/api/info").catch(() => {
      // Inspector bar degrades to whatever it already had — never throws to the shell.
    })
  }, [])

  const isLocal = headers.colo === "LOCAL"

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
    </div>
  )
}

export { CloudflareBar }
