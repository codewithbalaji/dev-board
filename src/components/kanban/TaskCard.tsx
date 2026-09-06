import * as React from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { cn } from "@/lib/utils"
import type { Task } from "@/hooks/useTasks"
import type { Member } from "@/hooks/useMembers"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const PRIORITY_GLYPH: Record<Task["priority"], string> = {
  low: "↓",
  medium: "·",
  high: "↑",
  urgent: "‼",
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

// Pure presentational card — shared by the live sortable instance and the
// DragOverlay ghost, so the two always look identical. No forwardRef: React 19
// passes `ref` as a plain prop.
function TaskCardView({
  ref,
  task,
  assignee,
  dragging,
  className,
  ...props
}: React.ComponentProps<"div"> & { ref?: React.Ref<HTMLDivElement>; task: Task; assignee?: Member; dragging?: boolean }) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex cursor-grab flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-shadow hover:border-muted-foreground/40 active:cursor-grabbing",
        dragging && "cursor-grabbing rotate-2 shadow-lg",
        className,
      )}
      {...props}
    >
      <p
        className={cn(
          "line-clamp-2 text-sm font-medium",
          task.status === "done" && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </p>

      {(task.priority !== "medium" || task.commentCount > 0) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {task.priority !== "medium" && (
            <span aria-label={`Priority: ${task.priority}`}>{PRIORITY_GLYPH[task.priority]}</span>
          )}
          {task.commentCount > 0 && <span>💬 {task.commentCount}</span>}
        </div>
      )}

      {assignee && (
        <div className="flex justify-end">
          <Avatar size="sm" title={assignee.name}>
            <AvatarFallback>{initials(assignee.name)}</AvatarFallback>
          </Avatar>
        </div>
      )}
    </div>
  )
}

function TaskCard({ task, assignee, onOpen }: { task: Task; assignee?: Member; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  return (
    <TaskCardView
      ref={setNodeRef}
      task={task}
      assignee={assignee}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // The DragOverlay renders the moving copy — hide the source slot so it
      // doesn't get clipped by the column's own overflow-y-auto boundary.
      className={isDragging ? "opacity-0" : undefined}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen()
      }}
    />
  )
}

export { TaskCard, TaskCardView }
