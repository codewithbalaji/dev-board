import { ApiError } from "./errors";

export type Role = "owner" | "admin" | "member" | "viewer";

export const ROLE_RANK = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
} as const satisfies Record<Role, number>;

export async function assertMembership(
  db: D1Database,
  projectId: string,
  userId: string,
  minimum: Role = "viewer",
): Promise<Role> {
  const row = await db
    .prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?")
    .bind(projectId, userId)
    .first<{ role: Role }>();
  if (!row) throw new ApiError(404, "NOT_FOUND", "Project not found");
  if (ROLE_RANK[row.role] < ROLE_RANK[minimum]) {
    throw new ApiError(403, "FORBIDDEN", "Insufficient role");
  }
  return row.role;
}

export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  position: number;
  assignee_id: string | null;
  created_by: string;
  due_at: number | null;
  created_at: number;
  updated_at: number;
}

// Resolves task -> project -> membership in one JOIN, so callers never fetch
// the task and check membership as two separate round trips.
export async function assertTaskMembership(
  db: D1Database,
  taskId: string,
  userId: string,
  minimum: Role = "viewer",
): Promise<{ role: Role; task: TaskRow }> {
  const row = await db
    .prepare(
      `SELECT t.*, pm.role AS __role
       FROM tasks t
       JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
       WHERE t.id = ?`,
    )
    .bind(userId, taskId)
    .first<TaskRow & { __role: Role }>();
  if (!row) throw new ApiError(404, "NOT_FOUND", "Task not found");
  if (ROLE_RANK[row.__role] < ROLE_RANK[minimum]) {
    throw new ApiError(403, "FORBIDDEN", "Insufficient role");
  }
  const { __role, ...task } = row;
  return { role: __role, task };
}
