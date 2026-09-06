// Mirrors worker/lib/schemas.ts's validation rules on the client so forms can
// show errors before round-tripping to the server. Kept as a deliberate
// duplicate rather than a cross-import — src/ and worker/ are separate
// compilation targets (DOM vs no-DOM) and don't share modules.
import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name must be between 1 and 60 characters").max(60),
  email: z.string().trim().toLowerCase().min(1, "Enter a valid email address").max(254).email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Enter a valid email address").max(254).email(),
  password: z.string().min(1, "Enter your password"),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

// Runs a schema and returns per-field error messages keyed by field name,
// instead of throwing — forms want all field errors at once, not the first.
export function collectFieldErrors<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  data: unknown,
): Partial<Record<keyof T, string>> {
  const result = schema.safeParse(data);
  if (result.success) return {};
  const errors: Partial<Record<keyof T, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof T | undefined;
    if (field && !(field in errors)) errors[field] = issue.message;
  }
  return errors;
}
