import * as React from "react"

import { apiFetch } from "@/api/client"
import type { Task } from "./useTasks"
import type { Comment } from "./useComments"
import type { Activity } from "./useActivities"

// Mirrors worker/lib/broadcast.ts's BroadcastMessage — duplicated deliberately,
// same rationale as position.ts/schemas.ts: src/ and worker/ are separate
// compilation targets.
export type BroadcastMessage =
  | { type: "task.upserted"; task: Task; mutationId?: string }
  | { type: "task.deleted"; taskId: string; projectId: string; mutationId?: string }
  | { type: "comment.upserted"; comment: Comment; mutationId?: string }
  | { type: "comment.deleted"; commentId: string; taskId: string; mutationId?: string }
  | { type: "activity.created"; activity: Activity; mutationId?: undefined }
  | { type: "presence"; members: PresenceMember[] }

export interface PresenceMember {
  userId: string
  displayName: string
}

export type ConnectionState = "connected" | "reconnecting" | "offline"

// Presence never reaches subscribers — useRealtime consumes it internally
// to populate `presence` below — so listeners only ever see entity changes.
export type EntityMessage = Exclude<BroadcastMessage, { type: "presence" }>

export interface UseRealtimeResult {
  connectionState: ConnectionState
  presence: PresenceMember[]
  // One shared socket, many listeners — mirrors src/api/client.ts's
  // subscribeHeaders/notify pattern instead of a bespoke pub/sub framework.
  subscribe(handler: (message: EntityMessage) => void): () => void
}

// 1s,2s,4s,8s,16s,30s then every 30s, per DESIGN.md §9. Exhausting the
// schedule (repeatedly landing on the last, 30s, step) is what flips the
// connection state from "reconnecting" to "offline".
const BACKOFF_SCHEDULE_MS = [1000, 2000, 4000, 8000, 16000, 30000]

function wsUrl(projectId: string, token: string): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${location.host}/api/ws?projectId=${encodeURIComponent(projectId)}&token=${encodeURIComponent(token)}`
}

export function useRealtime(projectId: string | null): UseRealtimeResult {
  const [connectionState, setConnectionState] = React.useState<ConnectionState>("reconnecting")
  const [presence, setPresence] = React.useState<PresenceMember[]>([])
  const listenersRef = React.useRef(new Set<(message: EntityMessage) => void>())

  const subscribe = React.useCallback((handler: (message: EntityMessage) => void) => {
    listenersRef.current.add(handler)
    return () => listenersRef.current.delete(handler)
  }, [])

  React.useEffect(() => {
    if (!projectId) {
      setConnectionState("offline")
      setPresence([])
      return
    }

    let cancelled = false
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0

    const connect = async () => {
      if (cancelled) return
      try {
        const { token } = await apiFetch<{ token: string }>("/api/auth/ws-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId }),
        })
        if (cancelled) return

        socket = new WebSocket(wsUrl(projectId, token))

        socket.addEventListener("open", () => {
          attempt = 0
          setConnectionState("connected")
        })

        socket.addEventListener("message", (event) => {
          const message = JSON.parse(event.data as string) as BroadcastMessage
          if (message.type === "presence") {
            setPresence(message.members)
            return
          }
          for (const listener of listenersRef.current) listener(message)
        })

        socket.addEventListener("close", () => {
          if (cancelled) return
          scheduleReconnect()
        })

        socket.addEventListener("error", () => {
          socket?.close()
        })
      } catch {
        if (!cancelled) scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      const exhausted = attempt >= BACKOFF_SCHEDULE_MS.length
      setConnectionState(exhausted ? "offline" : "reconnecting")
      const delay = BACKOFF_SCHEDULE_MS[Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1)]
      attempt += 1
      reconnectTimer = setTimeout(connect, delay + Math.random() * 300)
    }

    void connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [projectId])

  return { connectionState, presence, subscribe }
}
