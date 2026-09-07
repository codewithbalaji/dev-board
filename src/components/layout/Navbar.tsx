import * as React from "react"
import { Menu, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { SidebarContent } from "@/components/layout/Sidebar"
import type { Project } from "@/hooks/useProjects"
import type { AuthUser } from "@/stores/auth-store"

function getIsDark(): boolean {
  return document.documentElement.classList.contains("dark")
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

interface NavbarProps {
  user?: AuthUser | null
  projects?: Project[]
  selectedProjectId?: string | null
  onSelectProject?: (projectId: string) => void
  onCreateProject?: (name: string) => void
  onLogout?: () => void
  activeTab?: "board" | "activity"
  onTabChange?: (tab: "board" | "activity") => void
}

function Navbar({
  user,
  projects = [],
  selectedProjectId = null,
  onSelectProject,
  onCreateProject,
  onLogout,
  activeTab = "board",
  onTabChange,
}: NavbarProps) {
  const [isDark, setIsDark] = React.useState(getIsDark)
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false)
  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  const toggleTheme = () => {
    const next = !isDark
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("theme", next ? "dark" : "light")
    setIsDark(next)
  }

  return (
    <header
      data-slot="navbar"
      className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        {user && (
          <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
            <SheetContent side="left" className="w-60 p-0" showCloseButton={false}>
              <SheetTitle className="sr-only">Projects</SheetTitle>
              <SidebarContent
                projects={projects}
                selectedProjectId={selectedProjectId}
                onSelect={(id) => {
                  onSelectProject?.(id)
                  setMobileSidebarOpen(false)
                }}
                onCreate={(name) => onCreateProject?.(name)}
              />
            </SheetContent>
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Open projects"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu />
            </Button>
          </Sheet>
        )}

        <span className="shrink-0 text-sm font-semibold">◆ DevBoard</span>

        {user && projects.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="min-w-0">
                <span className="truncate">{selectedProject?.name ?? "Select a project"}</span>
                <span aria-hidden>▾</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {projects.map((project) => (
                <DropdownMenuItem key={project.id} onSelect={() => onSelectProject?.(project.id)}>
                  {project.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {user && selectedProjectId && (
          <Tabs
            value={activeTab}
            onValueChange={(value) => onTabChange?.(value as "board" | "activity")}
            className="hidden sm:block"
          >
            <TabsList>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          onClick={toggleTheme}
        >
          {isDark ? <Sun /> : <Moon />}
        </Button>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Account menu">
                <Avatar size="sm">
                  <AvatarFallback>{initials(user.name)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onLogout}>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}

export { Navbar }
