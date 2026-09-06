import * as React from "react"

import { cn } from "@/lib/utils"
import { createProjectSchema } from "@/lib/schemas"
import type { Project } from "@/hooks/useProjects"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function NewProjectAction({ onCreate }: { onCreate: (name: string) => void }) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [name, setName] = React.useState("")

  if (!isOpen) {
    return (
      <Button variant="ghost" size="sm" className="justify-start" onClick={() => setIsOpen(true)}>
        + New
      </Button>
    )
  }

  const submit = () => {
    const result = createProjectSchema.safeParse({ name })
    if (result.success) onCreate(result.data.name)
    setName("")
    setIsOpen(false)
  }

  return (
    <Input
      autoFocus
      placeholder="Project name"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit()
        if (e.key === "Escape") {
          setName("")
          setIsOpen(false)
        }
      }}
    />
  )
}

function SidebarContent({
  projects,
  selectedProjectId,
  onSelect,
  onCreate,
}: {
  projects: Project[]
  selectedProjectId: string | null
  onSelect: (projectId: string) => void
  onCreate: (name: string) => void
}) {
  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Projects</p>
      {projects.map((project) => (
        <button
          key={project.id}
          onClick={() => onSelect(project.id)}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
            project.id === selectedProjectId && "bg-muted font-medium",
          )}
        >
          {project.id === selectedProjectId && <span aria-hidden>▸</span>}
          <span className="truncate">{project.name}</span>
        </button>
      ))}
      <div className="mt-1">
        <NewProjectAction onCreate={onCreate} />
      </div>
    </div>
  )
}

function Sidebar(props: {
  projects: Project[]
  selectedProjectId: string | null
  onSelect: (projectId: string) => void
  onCreate: (name: string) => void
}) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-sidebar md:flex">
      <SidebarContent {...props} />
    </aside>
  )
}

export { Sidebar, SidebarContent }
