import { CloudflareBar } from "@/components/layout/CloudflareBar"
import { Navbar } from "@/components/layout/Navbar"

function App() {
  return (
    <div className="flex h-svh flex-col">
      <Navbar />
      <CloudflareBar />
      <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        The board arrives in Phase 2.
      </main>
    </div>
  )
}

export default App
