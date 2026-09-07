import { z } from "zod";
import { ApiError } from "./errors";

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

const emailSchema = z.string().trim().toLowerCase().max(254).email();
const passwordSchema = z.string().min(8).max(200);
const displayNameSchema = z.string().trim().min(1).max(60);
const titleSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().max(10_000);

export const registerSchema = z.object({
  name: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const createProjectSchema = z.object({
  name: titleSchema,
  description: descriptionSchema.optional(),
});

export const updateProjectSchema = z.object({
  name: titleSchema.optional(),
  description: descriptionSchema.nullable().optional(),
  color: z.string().min(1).max(40).optional(),
});

const mutationIdSchema = z.string().min(1).max(100).optional();

export const createTaskSchema = z.object({
  title: titleSchema,
  description: descriptionSchema.optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.uuidv4().optional(),
  mutationId: mutationIdSchema,
});

export const updateTaskSchema = z.object({
  title: titleSchema.optional(),
  description: descriptionSchema.nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.uuidv4().nullable().optional(),
  dueAt: z.number().finite().nullable().optional(),
  mutationId: mutationIdSchema,
});

export const taskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
  position: z.number().finite(),
  mutationId: mutationIdSchema,
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  mutationId: mutationIdSchema,
});

export const wsTokenSchema = z.object({
  projectId: z.uuidv4(),
});

// Converts the first Zod issue into the app's { code, message, details.field }
// error envelope, instead of leaking Zod's own error shape to clients.
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.length > 0 ? issue.path.join(".") : "body";
    throw new ApiError(422, "VALIDATION_FAILED", issue.message, { field });
  }
  return result.data;
}
