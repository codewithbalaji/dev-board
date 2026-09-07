import * as React from "react"
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext, useParams } from "react-router"
import { Toaster } from "sonner"

import { useAuth } from "@/hooks/useAuth"
import { useProjects, type UseProjectsResult } from "@/hooks/useProjects"
import { useRealtime, type UseRealtimeResult } from "@/hooks/useRealtime"
import { CloudflareBar } from "@/components/layout/CloudflareBar"
import { Navbar } from "@/components/layout/Navbar"
import { Sidebar } from "@/components/layout/Sidebar"
import { Board } from "@/components/kanban/Board"
import { ActivityFeed } from "@/components/activity/ActivityFeed"
import { useMembers } from "@/hooks/useMembers"
import { LoginForm } from "@/components/auth/LoginForm"
import { RegisterForm } from "@/components/auth/RegisterForm"

function LoadingScreen() {
  return <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading…</main>
}

// Logged-out visitors only — an authenticated user hitting /login or
// /register is bounced back to their board.
function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (user) return <Navigate to="/" replace />
  return children
}

// Gates every authenticated route; unauthenticated visitors are sent to /login.
function RequireAuth() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

// Handed down through Outlet context, alongside the project list, so Board
// (reached via a nested route) and CloudflareBar (a shell-level sibling) can
// share one realtime connection without a separate global store for it.
type ShellContext = UseProjectsResult & { realtime: UseRealtimeResult }

// Navbar + Sidebar + the routed content. Fetches the project list once and
// hands it to routed children via Outlet context, so Navbar/Sidebar/Board
// all agree on one list without a separate global store for it.
function AuthenticatedShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ projectSlug?: string }>()
  const projectsResult = useProjects()
  const { projects, createProject } = projectsResult

  const selectedProject = projects.find((p) => p.slug === params.projectSlug) ?? null
  const selectedProjectId = selectedProject?.id ?? null
  const realtime = useRealtime(selectedProjectId)
  const activeTab = location.pathname.endsWith("/activity") ? "activity" : "board"

  const goToProject = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (project) navigate(`/${project.slug}`)
  }

  const handleCreateProject = async (name: string) => {
    const project = await createProject({ name })
    navigate(`/${project.slug}`)
  }

  return (
    <>
      <Navbar
        user={user}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={goToProject}
        onCreateProject={handleCreateProject}
        onLogout={logout}
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (!selectedProject) return
          navigate(tab === "board" ? `/${selectedProject.slug}` : `/${selectedProject.slug}/activity`)
        }}
      />
      <CloudflareBar
        projectId={selectedProjectId}
        connectionState={selectedProjectId ? realtime.connectionState : undefined}
        presence={realtime.presence}
        subscribe={selectedProjectId ? realtime.subscribe : undefined}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelect={goToProject}
          onCreate={handleCreateProject}
        />
        <Outlet context={{ ...projectsResult, realtime } satisfies ShellContext} />
      </div>
    </>
  )
}

// "/" — redirects to the first project once loaded, or prompts to create one.
function HomeRoute() {
  const { projects, isLoading } = useOutletContext<ShellContext>()
  if (isLoading) return <LoadingScreen />
  if (projects.length > 0) return <Navigate to={`/${projects[0].slug}`} replace />
  return (
    <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      Create a project to get started.
    </main>
  )
}

// "/:projectSlug" and "/:projectSlug/tasks/:taskId" — same component, the
// optional taskId (present only on the nested path) drives whether TaskModal
// is open, so the modal is bookmarkable and closes on browser back.
function BoardRoute() {
  const { projectSlug, taskId } = useParams<{ projectSlug: string; taskId?: string }>()
  const { projects, isLoading, realtime } = useOutletContext<ShellContext>()

  if (isLoading) return <LoadingScreen />

  const project = projects.find((p) => p.slug === projectSlug)
  if (!project) return <Navigate to="/" replace />

  return <Board project={project} openTaskId={taskId ?? null} realtime={realtime} />
}

// "/:projectSlug/activity" — narrow-screen tab view of the feed; the same
// Board route also renders ActivityFeed as a right rail at lg: widths.
function ActivityRoute() {
  const { projectSlug } = useParams<{ projectSlug: string }>()
  const { projects, isLoading, realtime } = useOutletContext<ShellContext>()
  const project = projects.find((p) => p.slug === projectSlug) ?? null
  const members = useMembers(project?.id ?? null)

  if (isLoading) return <LoadingScreen />
  if (!project) return <Navigate to="/" replace />

  return <ActivityFeed projectId={project.id} members={members} subscribe={realtime.subscribe} />
}

function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate()
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      {mode === "login" ? (
        <LoginForm onSwitchToRegister={() => navigate("/register")} />
      ) : (
        <RegisterForm onSwitchToLogin={() => navigate("/login")} />
      )}
    </main>
  )
}

function App() {
  return (
    <div className="flex h-svh flex-col">
      <Routes>
        <Route
          path="/login"
          element={
            <>
              <Navbar />
              <PublicOnly>
                <AuthScreen mode="login" />
              </PublicOnly>
            </>
          }
        />
        <Route
          path="/register"
          element={
            <>
              <Navbar />
              <PublicOnly>
                <AuthScreen mode="register" />
              </PublicOnly>
            </>
          }
        />
        <Route element={<RequireAuth />}>
          <Route element={<AuthenticatedShell />}>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/:projectSlug" element={<BoardRoute />} />
            <Route path="/:projectSlug/tasks/:taskId" element={<BoardRoute />} />
            <Route path="/:projectSlug/activity" element={<ActivityRoute />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="bottom-right" />
    </div>
  )
}

export default App
