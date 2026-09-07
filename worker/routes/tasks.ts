import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { authMiddleware } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { assertMembership, assertTaskMembership, ROLE_RANK, type TaskRow } from "../lib/authz";
import { nextPosition } from "../lib/position";
import { cacheKeys } from "../lib/cache-keys";
import { broadcastToProject } from "../lib/broadcast";
import {
  createCommentSchema,
  createTaskSchema,
  parseOrThrow,
  taskStatusSchema,
  updateTaskSchema,
} from "../lib/schemas";

export function toApiTask(row: TaskRow, commentCount = 0) {
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

export function toApiComment(row: CommentRow) {
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

  const { title, description, priority, assigneeId, mutationId } = parseOrThrow(
    createTaskSchema,
    await c.req.json(),
  );

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
  await c.env.KV.delete(cacheKeys.projectStats(projectId));

  const row = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<TaskRow>();
  const apiTask = toApiTask(row as TaskRow);
  await broadcastToProject(c.env, projectId, { type: "task.upserted", task: apiTask, mutationId });
  await c.env.ACTIVITY_QUEUE.send({
    type: "task.created",
    projectId,
    actorId: user.id,
    entityType: "task",
    entityId: id,
    payload: { title: apiTask.title, status: apiTask.status },
    occurredAt: Math.floor(Date.now() / 1000),
  });
  return c.json({ task: apiTask });
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
  const { task } = await assertTaskMembership(c.env.DB, taskId, user.id, "member");

  const body = parseOrThrow(updateTaskSchema, await c.req.json());
  const updates: string[] = [];
  const values: unknown[] = [];
  const changed: string[] = [];

  if (body.title !== undefined) {
    updates.push("title = ?");
    values.push(body.title);
    changed.push("title");
  }
  if (body.description !== undefined) {
    updates.push("description = ?");
    values.push(body.description);
    changed.push("description");
  }
  if (body.priority !== undefined) {
    updates.push("priority = ?");
    values.push(body.priority);
    changed.push("priority");
  }
  if (body.assigneeId !== undefined) {
    updates.push("assignee_id = ?");
    values.push(body.assigneeId);
    changed.push("assigneeId");
  }
  if (body.dueAt !== undefined) {
    updates.push("due_at = ?");
    values.push(body.dueAt);
    changed.push("dueAt");
  }

  if (updates.length > 0) {
    updates.push("updated_at = unixepoch()");
    values.push(taskId);
    await c.env.DB.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  const row = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).first<TaskRow>();
  const apiTask = toApiTask(row as TaskRow);
  if (updates.length > 0) {
    await broadcastToProject(c.env, task.project_id, {
      type: "task.upserted",
      task: apiTask,
      mutationId: body.mutationId,
    });
    await c.env.ACTIVITY_QUEUE.send({
      type: "task.updated",
      projectId: task.project_id,
      actorId: user.id,
      entityType: "task",
      entityId: taskId,
      payload: { title: apiTask.title, changed },
      occurredAt: Math.floor(Date.now() / 1000),
    });
  }
  return c.json({ task: apiTask });
});

tasks.patch("/tasks/:id/status", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  const { task } = await assertTaskMembership(c.env.DB, taskId, user.id, "member");

  const { status, position, mutationId } = parseOrThrow(taskStatusSchema, await c.req.json());

  const res = await c.env.DB.prepare(
    "UPDATE tasks SET status = ?, position = ?, updated_at = unixepoch() WHERE id = ?",
  )
    .bind(status, position, taskId)
    .run();
  if (res.meta.changes === 0) throw new ApiError(404, "NOT_FOUND", "Task not found");
  await c.env.KV.delete(cacheKeys.projectStats(task.project_id));

  const row = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).first<TaskRow>();
  const apiTask = toApiTask(row as TaskRow);
  await broadcastToProject(c.env, task.project_id, { type: "task.upserted", task: apiTask, mutationId });
  await c.env.ACTIVITY_QUEUE.send({
    type: "task.status_changed",
    projectId: task.project_id,
    actorId: user.id,
    entityType: "task",
    entityId: taskId,
    payload: { title: apiTask.title, from: task.status, to: status },
    occurredAt: Math.floor(Date.now() / 1000),
  });
  return c.json({ task: apiTask });
});

tasks.delete("/tasks/:id", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  const { task } = await assertTaskMembership(c.env.DB, taskId, user.id, "member");

  // R2 objects don't fall under D1's ON DELETE CASCADE — clean them up first,
  // or the task delete below orphans them in the bucket.
  const { results: fileRows } = await c.env.DB.prepare(
    "SELECT file_key FROM attachments WHERE task_id = ?",
  )
    .bind(taskId)
    .all<{ file_key: string }>();
  if (fileRows.length > 0) {
    await c.env.BUCKET.delete(fileRows.map((r) => r.file_key));
  }

  await c.env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(taskId).run();
  await c.env.KV.delete(cacheKeys.projectStats(task.project_id));
  await broadcastToProject(c.env, task.project_id, {
    type: "task.deleted",
    taskId,
    projectId: task.project_id,
    mutationId: c.req.query("mutationId"),
  });
  await c.env.ACTIVITY_QUEUE.send({
    type: "task.deleted",
    projectId: task.project_id,
    actorId: user.id,
    entityType: "task",
    entityId: taskId,
    payload: { title: task.title },
    occurredAt: Math.floor(Date.now() / 1000),
  });
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
  const { task } = await assertTaskMembership(c.env.DB, taskId, user.id, "member");

  const { body: commentBody, mutationId } = parseOrThrow(createCommentSchema, await c.req.json());

  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO comments (id, task_id, author_id, body) VALUES (?, ?, ?, ?)")
    .bind(id, taskId, user.id, commentBody)
    .run();
  await c.env.KV.delete(cacheKeys.projectStats(task.project_id));

  const row = await c.env.DB.prepare("SELECT * FROM comments WHERE id = ?").bind(id).first<CommentRow>();
  const apiComment = toApiComment(row as CommentRow);
  await broadcastToProject(c.env, task.project_id, {
    type: "comment.upserted",
    comment: apiComment,
    mutationId,
  });
  await c.env.ACTIVITY_QUEUE.send({
    type: "comment.created",
    projectId: task.project_id,
    actorId: user.id,
    entityType: "comment",
    entityId: id,
    payload: { taskId, taskTitle: task.title, excerpt: apiComment.body.slice(0, 140) },
    occurredAt: Math.floor(Date.now() / 1000),
  });
  return c.json({ comment: apiComment });
});

tasks.delete("/comments/:id", async (c) => {
  const user = c.get("user");
  const commentId = c.req.param("id");

  const row = await c.env.DB.prepare(
    `SELECT c.*, t.project_id as __projectId, pm.role as __role
     FROM comments c
     JOIN tasks t ON t.id = c.task_id
     JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
     WHERE c.id = ?`,
  )
    .bind(user.id, commentId)
    .first<CommentRow & { __projectId: string; __role: "owner" | "admin" | "member" | "viewer" }>();
  if (!row) throw new ApiError(404, "NOT_FOUND", "Comment not found");

  const canDelete = row.author_id === user.id || ROLE_RANK[row.__role] >= ROLE_RANK.admin;
  if (!canDelete) throw new ApiError(403, "FORBIDDEN", "Insufficient role");

  await c.env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(commentId).run();
  await c.env.KV.delete(cacheKeys.projectStats(row.__projectId));
  await broadcastToProject(c.env, row.__projectId, {
    type: "comment.deleted",
    commentId,
    taskId: row.task_id,
    mutationId: c.req.query("mutationId"),
  });
  return c.json({ deleted: true });
});

export default tasks;
