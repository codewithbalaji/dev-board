function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="text-xs text-destructive" role="alert">
      {message}
    </p>
  )
}

export { FieldError }
