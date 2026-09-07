import * as React from "react"
import { toast } from "sonner"

import type { Task, TaskPriority } from "@/hooks/useTasks"
import type { Member } from "@/hooks/useMembers"
import { useAuth } from "@/hooks/useAuth"
import { useComments } from "@/hooks/useComments"
import type { EntityMessage } from "@/hooks/useRealtime"
import { downloadAttachment, useAttachments } from "@/hooks/useAttachments"
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
import { Progress } from "@/components/ui/progress"

// Mirrors worker/routes/attachments.ts's allow-list — duplicated deliberately,
// the same way src/ and worker/ already duplicate TASK_STATUSES/TASK_PRIORITIES,
// since the two are separate build targets. Client-side checks are just for
// instant feedback; the server re-validates independently either way.
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/zip",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
  subscribe,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: Task
  members: Member[]
  subscribe?: (handler: (message: EntityMessage) => void) => () => void
  onClose: () => void
  onUpdate: (patch: Partial<Pick<Task, "title" | "description" | "priority" | "assigneeId" | "dueAt">>) => void
  onDelete: () => void
}) {
  const { user } = useAuth()
  const { comments, isLoading: commentsLoading, postComment } = useComments(task.id, { subscribe })
  const { attachments, uploadProgress, upload, deleteAttachment } = useAttachments(task.id)
  const [draftComment, setDraftComment] = React.useState("")
  const [isDraggingFile, setIsDraggingFile] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const assignee = members.find((m) => m.userId === task.assigneeId)
  const membersById = React.useMemo(() => new Map(members.map((m) => [m.userId, m])), [members])
  const myRole = user ? membersById.get(user.id)?.role : undefined
  const canManageAttachments = myRole === "admin" || myRole === "owner"

  const submitComment = () => {
    const result = createCommentSchema.safeParse({ body: draftComment })
    if (!result.success) return
    void postComment(result.data.body)
    setDraftComment("")
  }

  const submitUpload = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Too large — 10 MB maximum")
      return
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      toast.error("File type not allowed")
      return
    }
    upload(file).catch((err) => {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    })
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

        <div
          className="max-h-[60vh] overflow-y-auto"
          onDragOver={(e) => {
            e.preventDefault()
            setIsDraggingFile(true)
          }}
          onDragLeave={() => setIsDraggingFile(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDraggingFile(false)
            const file = e.dataTransfer.files[0]
            if (file) submitUpload(file)
          }}
        >
          <InlineEditableDescription
            value={task.description}
            onCommit={(description) => onUpdate({ description })}
          />

          <div
            className={
              isDraggingFile
                ? "mt-4 flex flex-col gap-2 rounded-md border-2 border-dashed border-primary bg-primary/5 p-2"
                : "mt-4 flex flex-col gap-2"
            }
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                Attachments ({attachments.length})
              </p>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                + Add file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) submitUpload(file)
                  e.target.value = ""
                }}
              />
            </div>

            {uploadProgress !== null && <Progress value={uploadProgress} />}

            {attachments.map((attachment) => {
              const canDelete = attachment.uploadedBy === user?.id || canManageAttachments
              return (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => void downloadAttachment(attachment.id, attachment.filename)}
                    className="truncate text-left hover:underline"
                    title={`Download ${attachment.filename}`}
                  >
                    {attachment.filename}
                  </button>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatSize(attachment.size)}</span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => deleteAttachment(attachment.id)}
                        aria-label={`Delete ${attachment.filename}`}
                        className="hover:text-destructive"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

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
