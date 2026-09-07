import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { authMiddleware } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { assertTaskMembership, ROLE_RANK, type Role } from "../lib/authz";
import { cacheKeys } from "../lib/cache-keys";

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "application/zip": ".zip",
  "text/csv": ".csv",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface AttachmentRow {
  id: string;
  task_id: string;
  file_key: string;
  filename: string;
  size: number;
  mime_type: string;
  uploaded_by: string;
  created_at: number;
}

function toApiAttachment(row: AttachmentRow) {
  return {
    id: row.id,
    taskId: row.task_id,
    filename: row.filename,
    size: row.size,
    mimeType: row.mime_type,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

// Strips characters that would break a quoted Content-Disposition filename param.
function sanitizeFilename(name: string): string {
  return name.replace(/["\r\n]/g, "");
}

const attachments = new Hono<{ Bindings: Env; Variables: Variables }>();

attachments.use("*", authMiddleware);

attachments.get("/tasks/:id/attachments", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  await assertTaskMembership(c.env.DB, taskId, user.id, "viewer");

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at",
  )
    .bind(taskId)
    .all<AttachmentRow>();

  return c.json({ attachments: results.map(toApiAttachment) });
});

attachments.post("/tasks/:id/attachments", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  const { task } = await assertTaskMembership(c.env.DB, taskId, user.id, "member");

  const contentLength = c.req.header("content-length");
  if (contentLength && Number(contentLength) > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "File exceeds the 10 MB limit");
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) {
    throw new ApiError(422, "VALIDATION_FAILED", "A file is required", { field: "file" });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "File exceeds the 10 MB limit");
  }
  const ext = MIME_EXT[file.type];
  if (!ext) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "File type not allowed");
  }

  const filename = sanitizeFilename(file.name);
  const key = `attachments/${task.project_id}/${taskId}/${crypto.randomUUID()}${ext}`;

  // R2 first, D1 second — a D1 failure after this leaves an orphaned object,
  // the accepted tradeoff documented in database.md; the reverse order would
  // leave a metadata row pointing at nothing, which is worse.
  await c.env.BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
      contentDisposition: `attachment; filename="${filename}"`,
    },
  });

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO attachments (id, task_id, file_key, filename, size, mime_type, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, taskId, key, filename, file.size, file.type, user.id)
    .run();
  await c.env.KV.delete(cacheKeys.projectStats(task.project_id));

  const row = await c.env.DB.prepare("SELECT * FROM attachments WHERE id = ?")
    .bind(id)
    .first<AttachmentRow>();
  return c.json({ attachment: toApiAttachment(row as AttachmentRow) }, 201);
});

attachments.get("/attachments/:id/download", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(
    `SELECT a.*, pm.role AS __role
     FROM attachments a
     JOIN tasks t ON t.id = a.task_id
     JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
     WHERE a.id = ?`,
  )
    .bind(user.id, id)
    .first<AttachmentRow & { __role: Role }>();
  if (!row) throw new ApiError(404, "NOT_FOUND", "Attachment not found");

  const object = await c.env.BUCKET.get(row.file_key);
  if (!object) throw new ApiError(404, "NOT_FOUND", "File not found");

  return new Response(object.body, {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Disposition": `attachment; filename="${sanitizeFilename(row.filename)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

attachments.delete("/attachments/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(
    `SELECT a.*, t.project_id AS __projectId, pm.role AS __role
     FROM attachments a
     JOIN tasks t ON t.id = a.task_id
     JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
     WHERE a.id = ?`,
  )
    .bind(user.id, id)
    .first<AttachmentRow & { __projectId: string; __role: Role }>();
  if (!row) throw new ApiError(404, "NOT_FOUND", "Attachment not found");

  const canDelete = row.uploaded_by === user.id || ROLE_RANK[row.__role] >= ROLE_RANK.admin;
  if (!canDelete) throw new ApiError(403, "FORBIDDEN", "Insufficient role");

  // R2 first, D1 last — same ordering rule as the task-deletion cascade.
  await c.env.BUCKET.delete(row.file_key);
  await c.env.DB.prepare("DELETE FROM attachments WHERE id = ?").bind(id).run();
  await c.env.KV.delete(cacheKeys.projectStats(row.__projectId));

  return c.body(null, 204);
});

export default attachments;
