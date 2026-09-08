import * as React from "react"

import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FieldError } from "@/components/auth/field-error"
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/auth/turnstile-widget"
import { RateLimitBanner } from "@/components/auth/rate-limit-banner"
import { cn } from "@/lib/utils"
import { collectFieldErrors, registerSchema } from "@/lib/schemas"

type FieldErrors = ReturnType<typeof collectFieldErrors<typeof registerSchema.shape>>

function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { register, error, retryAfter } = useAuth()
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({})
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null)
  const turnstileRef = React.useRef<TurnstileWidgetHandle>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors = collectFieldErrors(registerSchema, { name, email, password })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0 || !turnstileToken) return

    setIsSubmitting(true)
    await register(name, email, password, turnstileToken)
    turnstileRef.current?.reset()
    setIsSubmitting(false)
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-lg font-semibold">Create your account</span>
        <button type="button" onClick={onSwitchToLogin} className="text-left text-sm text-muted-foreground underline-offset-4 hover:underline">
          Already have one? Sign in
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-name">Name</Label>
          <Input
            id="register-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!fieldErrors.name}
          />
          <FieldError message={fieldErrors.name} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-email">Email</Label>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldErrors.email}
          />
          <FieldError message={fieldErrors.email} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-password">Password</Label>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fieldErrors.password}
          />
          {fieldErrors.password ? (
            <FieldError message={fieldErrors.password} />
          ) : (
            <p className="text-xs text-muted-foreground">At least 8 characters</p>
          )}
        </div>

        <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} />

        {retryAfter ? (
          <RateLimitBanner retryAfterSeconds={retryAfter} />
        ) : (
          error && (
            <div className={cn("rounded-lg bg-destructive/10 p-3 text-sm text-destructive")} role="alert">
              {error}
            </div>
          )
        )}

        <Button type="submit" disabled={isSubmitting || !turnstileToken} className="w-full">
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </div>
  )
}

export { RegisterForm }
