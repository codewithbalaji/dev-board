import * as React from "react"

import type { Task, TaskPriority } from "@/hooks/useTasks"
import type { Member } from "@/hooks/useMembers"
import { useAuth } from "@/hooks/useAuth"
import { useComments } from "@/hooks/useComments"
import { relativeTime } from "@/lib/relative-time"
import { createCommentSchema } from "@/lib/schemas"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}

const STATUS_LABEL: Record<Task["status"], string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function InlineEditableTitle({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value)
          setIsEditing(true)
        }}
        className="text-left text-lg font-medium hover:underline"
      >
        {value}
      </button>
    )
  }

  const commit = () => {
    setIsEditing(false)
    const trimmed = draft.trim()
    if (trimmed.length > 0 && trimmed !== value) onCommit(trimmed)
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit()
        if (e.key === "Escape") setIsEditing(false)
      }}
      className="w-full rounded-md border border-input bg-transparent text-lg font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
    />
  )
}

function InlineEditableDescription({
  value,
  onCommit,
}: {
  value: string | null
  onCommit: (next: string) => void
}) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value ?? "")

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value ?? "")
          setIsEditing(true)
        }}
        className="min-h-16 w-full rounded-md p-2 text-left text-sm text-muted-foreground hover:bg-muted"
      >
        {value || "Add a description…"}
      </button>
    )
  }

  const commit = () => {
    setIsEditing(false)
    if (draft !== (value ?? "")) onCommit(draft)
  }

  return (
    <textarea
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") setIsEditing(false)
      }}
      rows={4}
      className="w-full rounded-md border border-input bg-transparent p-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
    />
  )
}

function TaskModal({
  task,
  members,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: Task
  members: Member[]
  onClose: () => void
  onUpdate: (patch: Partial<Pick<Task, "title" | "description" | "priority" | "assigneeId" | "dueAt">>) => void
  onDelete: () => void
}) {
  const { user } = useAuth()
  const { comments, isLoading: commentsLoading, postComment } = useComments(task.id)
  const [draftComment, setDraftComment] = React.useState("")
  const assignee = members.find((m) => m.userId === task.assigneeId)
  const membersById = React.useMemo(() => new Map(members.map((m) => [m.userId, m])), [members])

  const submitComment = () => {
    const result = createCommentSchema.safeParse({ body: draftComment })
    if (!result.success) return
    void postComment(result.data.body)
    setDraftComment("")
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl gap-4 rounded-xl">
        <DialogHeader>
          <DialogTitle asChild>
            <InlineEditableTitle value={task.title} onCommit={(title) => onUpdate({ title })} />
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {STATUS_LABEL[task.status]} · {PRIORITY_LABEL[task.priority]}
            {assignee ? ` · ${assignee.name}` : ""}
            {task.dueAt ? ` · Due ${new Date(task.dueAt * 1000).toLocaleDateString()}` : ""}
          </p>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          <InlineEditableDescription
            value={task.description}
            onCommit={(description) => onUpdate({ description })}
          />

          <div className="mt-4 flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground">Comments</p>
            {commentsLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : (
              comments.map((comment) => {
                const author = membersById.get(comment.authorId)
                const authorName = author?.name ?? (comment.authorId === user?.id ? user.name : "Someone")
                const isPending = comment.id.startsWith("pending-")
                return (
                  <div key={comment.id} className={isPending ? "opacity-60" : ""}>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Avatar size="sm">
                        <AvatarFallback>{initials(authorName)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground">{authorName}</span>
                      <span>{relativeTime(comment.createdAt)}</span>
                    </div>
                    <p className="mt-1 pl-8 text-sm">{comment.body}</p>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <textarea
            placeholder="Write a comment… (⌘/Ctrl+Enter to send)"
            value={draftComment}
            onChange={(e) => setDraftComment(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitComment()
            }}
            rows={2}
            className="w-full rounded-md border border-input bg-transparent p-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          />
          <Button size="sm" className="self-end" onClick={submitComment}>
            Comment
          </Button>
        </div>

        <DialogFooter>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Delete task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { TaskModal }
