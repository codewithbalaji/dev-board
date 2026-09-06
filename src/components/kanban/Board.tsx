import * as React from "react"
import { useNavigate } from "react-router"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useDroppable } from "@dnd-kit/core"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { midpoint, nextPosition } from "@/lib/position"
import { createTaskSchema } from "@/lib/schemas"
import { useTasks, type Task, type TaskStatus } from "@/hooks/useTasks"
import { useMembers } from "@/hooks/useMembers"
import type { Project } from "@/hooks/useProjects"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { TaskCard, TaskCardView } from "@/components/kanban/TaskCard"
import { TaskModal } from "@/components/kanban/TaskModal"

const COLUMNS: { status: TaskStatus; label: string; icon: string }[] = [
  { status: "todo", label: "To do", icon: "○" },
  { status: "in_progress", label: "In progress", icon: "◐" },
  { status: "done", label: "Done", icon: "●" },
]

function Column({
  status,
  label,
  icon,
  tasks,
  members,
  onOpenTask,
}: {
  status: TaskStatus
  label: string
  icon: string
  tasks: Task[]
  members: ReturnType<typeof useMembers>
  onOpenTask: (task: Task) => void
}) {
  const { setNodeRef } = useDroppable({ id: status })
  const membersById = React.useMemo(() => new Map(members.map((m) => [m.userId, m])), [members])

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-border bg-background px-1 py-2 text-sm font-medium">
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
        <span className="text-muted-foreground">({tasks.length})</span>
      </div>
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-1 pt-2">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">Nothing in {label} yet.</p>
          )}
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              assignee={task.assigneeId ? membersById.get(task.assigneeId) : undefined}
              onOpen={() => onOpenTask(task)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="flex flex-1 gap-4 overflow-hidden p-4">
      {COLUMNS.map((col) => (
        <div key={col.status} className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
    </div>
  )
}

function NewTaskInput({ onCreate }: { onCreate: (title: string) => void }) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")

  if (!isOpen) {
    return (
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        + New task
      </Button>
    )
  }

  const submit = () => {
    const result = createTaskSchema.safeParse({ title })
    if (result.success) onCreate(result.data.title)
    setTitle("")
    setIsOpen(false)
  }

  return (
    <Input
      autoFocus
      placeholder="Task title"
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit()
        if (e.key === "Escape") {
          setTitle("")
          setIsOpen(false)
        }
      }}
      className="w-48"
    />
  )
}

function Board({ project, openTaskId }: { project: Project; openTaskId: string | null }) {
  const navigate = useNavigate()
  const closeTask = () => navigate(`/${project.slug}`)
  const goToTask = (taskId: string) => navigate(`/${project.slug}/tasks/${taskId}`)
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null)

  const handleMutationError = React.useCallback((message: string, retry: () => void) => {
    toast.error(message, { action: { label: "Retry", onClick: retry } })
  }, [])

  const { tasks, isLoading, error, createTask, moveTask, updateTask, deleteTask, refetch } = useTasks(project.id, {
    onMutationError: handleMutationError,
  })
  const members = useMembers(project.id)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const byStatus = React.useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] }
    for (const task of tasks) grouped[task.status].push(task)
    for (const status of Object.keys(grouped) as TaskStatus[]) {
      grouped[status].sort((a, b) => a.position - b.position)
    }
    return grouped
  }, [tasks])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null)
    const { active, over } = event
    if (!over) return

    const activeTask = tasks.find((t) => t.id === active.id)
    if (!activeTask) return

    const overId = String(over.id)
    const overIsColumn = COLUMNS.some((c) => c.status === overId)
    const targetStatus = (overIsColumn ? overId : tasks.find((t) => t.id === overId)?.status) as
      | TaskStatus
      | undefined
    if (!targetStatus) return

    const columnTasks = byStatus[targetStatus].filter((t) => t.id !== activeTask.id)

    let position: number
    if (overIsColumn) {
      position = nextPosition(columnTasks.at(-1)?.position ?? null)
    } else {
      const overIndex = columnTasks.findIndex((t) => t.id === overId)
      const prev = overIndex > 0 ? columnTasks[overIndex - 1] : null
      const next = overIndex >= 0 ? columnTasks[overIndex] : null
      position = midpoint(prev?.position ?? null, next?.position ?? null)
    }

    if (targetStatus === activeTask.status && position === activeTask.position) return
    moveTask(activeTask.id, targetStatus, position)
  }

  const openTask = tasks.find((t) => t.id === openTaskId) ?? null
  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null
  const membersById = React.useMemo(() => new Map(members.map((m) => [m.userId, m])), [members])
  const inProgressCount = byStatus.in_progress.length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">{project.name}</h1>
          <p className="text-xs text-muted-foreground">
            {tasks.length} tasks · {inProgressCount} in progress · {project.memberCount ?? members.length} members
          </p>
        </div>
        <NewTaskInput onCreate={(title) => void createTask({ title })} />
      </div>

      {isLoading ? (
        <BoardSkeleton />
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <p>Couldn't load this board.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <p>No tasks yet</p>
          <NewTaskInput onCreate={(title) => void createTask({ title })} />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveTaskId(null)}
        >
          <div className={cn("flex flex-1 gap-4 overflow-hidden p-4")}>
            {COLUMNS.map((col) => (
              <Column
                key={col.status}
                status={col.status}
                label={col.label}
                icon={col.icon}
                tasks={byStatus[col.status]}
                members={members}
                onOpenTask={(task) => goToTask(task.id)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask && (
              <TaskCardView
                task={activeTask}
                assignee={activeTask.assigneeId ? membersById.get(activeTask.assigneeId) : undefined}
                dragging
              />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {openTask && (
        <TaskModal
          task={openTask}
          members={members}
          onClose={closeTask}
          onUpdate={(patch) => updateTask(openTask.id, patch)}
          onDelete={() => {
            deleteTask(openTask.id)
            closeTask()
          }}
        />
      )}
    </div>
  )
}

export { Board }
