import * as React from "react"

import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FieldError } from "@/components/auth/field-error"
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/auth/turnstile-widget"
import { RateLimitBanner } from "@/components/auth/rate-limit-banner"
import { collectFieldErrors, loginSchema } from "@/lib/schemas"

type FieldErrors = ReturnType<typeof collectFieldErrors<typeof loginSchema.shape>>

function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { login, error, retryAfter } = useAuth()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({})
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null)
  const turnstileRef = React.useRef<TurnstileWidgetHandle>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors = collectFieldErrors(loginSchema, { email, password })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0 || !turnstileToken) return

    setIsSubmitting(true)
    await login(email, password, turnstileToken)
    turnstileRef.current?.reset()
    setIsSubmitting(false)
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-lg font-semibold">Sign in</span>
        <button type="button" onClick={onSwitchToRegister} className="text-left text-sm text-muted-foreground underline-offset-4 hover:underline">
          Need an account? Create one
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldErrors.email}
          />
          <FieldError message={fieldErrors.email} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fieldErrors.password}
          />
          <FieldError message={fieldErrors.password} />
        </div>

        <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} />

        {retryAfter ? (
          <RateLimitBanner retryAfterSeconds={retryAfter} />
        ) : (
          error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )
        )}

        <Button type="submit" disabled={isSubmitting || !turnstileToken} className="w-full">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  )
}

export { LoginForm }
