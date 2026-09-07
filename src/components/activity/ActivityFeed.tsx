import * as React from "react"

import { cn } from "@/lib/utils"
import { useActivities, type Activity } from "@/hooks/useActivities"
import type { Member } from "@/hooks/useMembers"
import type { UseRealtimeResult } from "@/hooks/useRealtime"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function relativeTime(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds)
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// Whole-second latency only — occurred_at/processed_at are unixepoch()
// integers, so sub-second precision isn't available without widening the
// schema's timestamp columns.
function describe(activity: Activity, actorName: string): string {
  const p = activity.payload
  switch (activity.type) {
    case "task.created":
      return `${actorName} created ${String(p.title ?? "a task")}`
    case "task.updated":
      return `${actorName} updated ${String(p.title ?? "a task")}`
    case "task.status_changed":
      return `${actorName} moved ${String(p.title ?? "a task")} to ${String(p.to ?? "")}`
    case "task.deleted":
      return `${actorName} deleted ${String(p.title ?? "a task")}`
    case "comment.created":
      return `${actorName} commented on ${String(p.taskTitle ?? "a task")}`
    case "attachment.uploaded":
      return `${actorName} attached ${String(p.filename ?? "a file")}`
    case "attachment.deleted":
      return `${actorName} removed ${String(p.filename ?? "a file")}`
    case "project.member_added":
      return `${String(p.displayName ?? actorName)} joined the project`
    default:
      return `${actorName} did something`
  }
}

function ActivityRow({ activity, actorName }: { activity: Activity; actorName: string }) {
  const latencySeconds = Math.max(0, activity.processedAt - activity.occurredAt)
  return (
    <li className="flex items-start gap-3 py-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
      <Avatar size="sm">
        <AvatarFallback>{initials(actorName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{describe(activity, actorName)}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{relativeTime(activity.occurredAt)}</span>
          <span aria-hidden>·</span>
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            via Cloudflare Queue
          </Badge>
          <span>+{latencySeconds}s</span>
        </p>
      </div>
    </li>
  )
}

interface ActivityFeedProps {
  projectId: string | null
  members: Member[]
  subscribe: UseRealtimeResult["subscribe"]
  variant?: "full" | "rail"
  className?: string
}

function ActivityFeed({ projectId, members, subscribe, variant = "full", className }: ActivityFeedProps) {
  const { activities, isLoading, hasMore, loadMore } = useActivities(projectId, { subscribe })
  const namesById = React.useMemo(() => new Map(members.map((m) => [m.userId, m.name])), [members])

  return (
    <div
      data-slot="activity-feed"
      className={cn(
        "flex min-w-0 flex-col",
        variant === "rail" ? "w-72 shrink-0 border-l border-border" : "flex-1",
        className,
      )}
    >
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Activity</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4">
        {isLoading ? (
          <div className="flex flex-col gap-2 py-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : activities.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing yet. Actions on this board will show up here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((activity) => (
              <ActivityRow
                key={activity.id}
                activity={activity}
                actorName={activity.actorId ? (namesById.get(activity.actorId) ?? "A removed member") : "A removed member"}
              />
            ))}
          </ul>
        )}
        {hasMore && !isLoading && (
          <div className="py-3">
            <Button variant="outline" size="sm" onClick={() => void loadMore()}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export { ActivityFeed }
