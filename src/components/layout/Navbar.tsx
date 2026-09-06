import * as React from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"

function getIsDark(): boolean {
  return document.documentElement.classList.contains("dark")
}

function Navbar() {
  const [isDark, setIsDark] = React.useState(getIsDark)

  const toggleTheme = () => {
    const next = !isDark
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("theme", next ? "dark" : "light")
    setIsDark(next)
  }

  return (
    <header
      data-slot="navbar"
      className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4"
    >
      <span className="text-sm font-semibold">◆ DevBoard</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        onClick={toggleTheme}
      >
        {isDark ? <Sun /> : <Moon />}
      </Button>
    </header>
  )
}

export { Navbar }
