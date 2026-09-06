import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { authMiddleware } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { assertMembership } from "../lib/authz";
import { createProjectSchema, parseOrThrow, updateProjectSchema } from "../lib/schemas";

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  owner_id: string;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

function toApiProject(row: ProjectRow, memberCount?: number) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
    ownerId: row.owner_id,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(memberCount !== undefined ? { memberCount } : {}),
  };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "project";
}

async function uniqueSlug(db: D1Database, ownerId: string, name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  // A handful of collisions at most in practice — one owner rarely has many
  // same-named projects.
  while (
    await db
      .prepare("SELECT 1 FROM projects WHERE owner_id = ? AND slug = ?")
      .bind(ownerId, candidate)
      .first()
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

const projects = new Hono<{ Bindings: Env; Variables: Variables }>();

projects.use("*", authMiddleware);

projects.get("/", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    `SELECT p.* FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = ?
     ORDER BY p.created_at DESC`,
  )
    .bind(user.id)
    .all<ProjectRow>();
  return c.json({ projects: results.map((row) => toApiProject(row)) });
});

projects.post("/", async (c) => {
  const user = c.get("user");
  const { name, description } = parseOrThrow(createProjectSchema, await c.req.json());

  const id = crypto.randomUUID();
  const slug = await uniqueSlug(c.env.DB, user.id, name);

  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO projects (id, name, slug, description, owner_id) VALUES (?, ?, ?, ?, ?)").bind(
      id,
      name,
      slug,
      description ?? null,
      user.id,
    ),
    c.env.DB.prepare("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner')").bind(
      id,
      user.id,
    ),
  ]);

  const row = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first<ProjectRow>();
  return c.json({ project: toApiProject(row as ProjectRow, 1) });
});

projects.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await assertMembership(c.env.DB, id, user.id, "viewer");

  const row = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first<ProjectRow>();
  if (!row) throw new ApiError(404, "NOT_FOUND", "Project not found");

  const memberCountRow = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM project_members WHERE project_id = ?",
  )
    .bind(id)
    .first<{ count: number }>();

  return c.json({ project: toApiProject(row, memberCountRow?.count ?? 0) });
});

// Not in the original Phase 2 route table — added so the board can render
// assignee names/avatars instead of bare user ids. Read-only, viewer+.
projects.get("/:id/members", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await assertMembership(c.env.DB, id, user.id, "viewer");

  const { results } = await c.env.DB.prepare(
    `SELECT u.id as userId, u.display_name as name, u.avatar_color as avatarColor, pm.role as role
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ?
     ORDER BY pm.created_at`,
  )
    .bind(id)
    .all<{ userId: string; name: string; avatarColor: string; role: string }>();

  return c.json({ members: results });
});

projects.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await assertMembership(c.env.DB, id, user.id, "admin");

  const body = parseOrThrow(updateProjectSchema, await c.req.json());
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    updates.push("name = ?");
    values.push(body.name);
  }
  if (body.description !== undefined) {
    updates.push("description = ?");
    values.push(body.description);
  }
  if (body.color !== undefined) {
    updates.push("color = ?");
    values.push(body.color);
  }

  if (updates.length > 0) {
    updates.push("updated_at = unixepoch()");
    values.push(id);
    await c.env.DB.prepare(`UPDATE projects SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  const row = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first<ProjectRow>();
  return c.json({ project: toApiProject(row as ProjectRow) });
});

projects.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await assertMembership(c.env.DB, id, user.id, "owner");

  await c.env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
  return c.json({ deleted: true });
});

export default projects;
