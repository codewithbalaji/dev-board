import * as React from "react"

function RateLimitBanner({ retryAfterSeconds }: { retryAfterSeconds: number }) {
  const [remaining, setRemaining] = React.useState(retryAfterSeconds)

  React.useEffect(() => {
    setRemaining(retryAfterSeconds)
  }, [retryAfterSeconds])

  React.useEffect(() => {
    if (remaining <= 0) return
    const timer = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [remaining])

  if (remaining <= 0) return null

  return (
    <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
      Too many attempts. Try again in {remaining}s.
    </div>
  )
}

export { RateLimitBanner }
