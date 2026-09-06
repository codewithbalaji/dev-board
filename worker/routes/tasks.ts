import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { authMiddleware } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { assertMembership, assertTaskMembership, ROLE_RANK, type TaskRow } from "../lib/authz";
import { nextPosition } from "../lib/position";
import {
  createCommentSchema,
  createTaskSchema,
  parseOrThrow,
  taskStatusSchema,
  updateTaskSchema,
} from "../lib/schemas";

function toApiTask(row: TaskRow, commentCount = 0) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    position: row.position,
    assigneeId: row.assignee_id,
    createdBy: row.created_by,
    dueAt: row.due_at,
    commentCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface CommentRow {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: number;
  updated_at: number;
}

function toApiComment(row: CommentRow) {
  return {
    id: row.id,
    taskId: row.task_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const tasks = new Hono<{ Bindings: Env; Variables: Variables }>();

tasks.use("*", authMiddleware);

tasks.get("/projects/:projectId/tasks", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  await assertMembership(c.env.DB, projectId, user.id, "viewer");

  const { results } = await c.env.DB.prepare(
    `SELECT t.*, (SELECT COUNT(*) FROM comments WHERE task_id = t.id) as comment_count
     FROM tasks t WHERE t.project_id = ? ORDER BY t.status, t.position`,
  )
    .bind(projectId)
    .all<TaskRow & { comment_count: number }>();

  return c.json({ tasks: results.map((row) => toApiTask(row, row.comment_count)) });
});

tasks.post("/projects/:projectId/tasks", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");
  await assertMembership(c.env.DB, projectId, user.id, "member");

  const { title, description, priority, assigneeId } = parseOrThrow(createTaskSchema, await c.req.json());

  const maxRow = await c.env.DB.prepare(
    "SELECT MAX(position) as maxPosition FROM tasks WHERE project_id = ? AND status = 'todo'",
  )
    .bind(projectId)
    .first<{ maxPosition: number | null }>();
  const position = nextPosition(maxRow?.maxPosition ?? null);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO tasks (id, project_id, title, description, priority, position, assignee_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, projectId, title, description ?? null, priority ?? "medium", position, assigneeId ?? null, user.id)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<TaskRow>();
  return c.json({ task: toApiTask(row as TaskRow) });
});

tasks.get("/tasks/:id", async (c) => {
  const user = c.get("user");
  const { task } = await assertTaskMembership(c.env.DB, c.req.param("id"), user.id, "viewer");
  const countRow = await c.env.DB.prepare("SELECT COUNT(*) as count FROM comments WHERE task_id = ?")
    .bind(task.id)
    .first<{ count: number }>();
  return c.json({ task: toApiTask(task, countRow?.count ?? 0) });
});

tasks.patch("/tasks/:id", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  await assertTaskMembership(c.env.DB, taskId, user.id, "member");

  const body = parseOrThrow(updateTaskSchema, await c.req.json());
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.title !== undefined) {
    updates.push("title = ?");
    values.push(body.title);
  }
  if (body.description !== undefined) {
    updates.push("description = ?");
    values.push(body.description);
  }
  if (body.priority !== undefined) {
    updates.push("priority = ?");
    values.push(body.priority);
  }
  if (body.assigneeId !== undefined) {
    updates.push("assignee_id = ?");
    values.push(body.assigneeId);
  }
  if (body.dueAt !== undefined) {
    updates.push("due_at = ?");
    values.push(body.dueAt);
  }

  if (updates.length > 0) {
    updates.push("updated_at = unixepoch()");
    values.push(taskId);
    await c.env.DB.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  const row = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).first<TaskRow>();
  return c.json({ task: toApiTask(row as TaskRow) });
});

tasks.patch("/tasks/:id/status", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  await assertTaskMembership(c.env.DB, taskId, user.id, "member");

  const { status, position } = parseOrThrow(taskStatusSchema, await c.req.json());

  const res = await c.env.DB.prepare(
    "UPDATE tasks SET status = ?, position = ?, updated_at = unixepoch() WHERE id = ?",
  )
    .bind(status, position, taskId)
    .run();
  if (res.meta.changes === 0) throw new ApiError(404, "NOT_FOUND", "Task not found");

  const row = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).first<TaskRow>();
  return c.json({ task: toApiTask(row as TaskRow) });
});

tasks.delete("/tasks/:id", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  await assertTaskMembership(c.env.DB, taskId, user.id, "member");

  await c.env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(taskId).run();
  return c.json({ deleted: true });
});

tasks.get("/tasks/:id/comments", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  await assertTaskMembership(c.env.DB, taskId, user.id, "viewer");

  const { results } = await c.env.DB.prepare("SELECT * FROM comments WHERE task_id = ? ORDER BY created_at")
    .bind(taskId)
    .all<CommentRow>();
  return c.json({ comments: results.map(toApiComment) });
});

tasks.post("/tasks/:id/comments", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  await assertTaskMembership(c.env.DB, taskId, user.id, "member");

  const { body: commentBody } = parseOrThrow(createCommentSchema, await c.req.json());

  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO comments (id, task_id, author_id, body) VALUES (?, ?, ?, ?)")
    .bind(id, taskId, user.id, commentBody)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM comments WHERE id = ?").bind(id).first<CommentRow>();
  return c.json({ comment: toApiComment(row as CommentRow) });
});

tasks.delete("/comments/:id", async (c) => {
  const user = c.get("user");
  const commentId = c.req.param("id");

  const row = await c.env.DB.prepare(
    `SELECT c.*, pm.role as __role
     FROM comments c
     JOIN tasks t ON t.id = c.task_id
     JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
     WHERE c.id = ?`,
  )
    .bind(user.id, commentId)
    .first<CommentRow & { __role: "owner" | "admin" | "member" | "viewer" }>();
  if (!row) throw new ApiError(404, "NOT_FOUND", "Comment not found");

  const canDelete = row.author_id === user.id || ROLE_RANK[row.__role] >= ROLE_RANK.admin;
  if (!canDelete) throw new ApiError(403, "FORBIDDEN", "Insufficient role");

  await c.env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(commentId).run();
  return c.json({ deleted: true });
});

export default tasks;
