import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { authMiddleware } from "../middleware/auth";
import { assertMembership } from "../lib/authz";
import type { ActivityType } from "../lib/activity";

export interface ActivityRow {
  id: string;
  project_id: string;
  actor_id: string | null;
  type: string;
  entity_type: "project" | "task" | "comment" | "attachment";
  entity_id: string | null;
  payload: string;
  occurred_at: number;
  processed_at: number;
}

export function toApiActivity(row: ActivityRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    actorId: row.actor_id,
    type: row.type as ActivityType,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    occurredAt: row.occurred_at,
    processedAt: row.processed_at,
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseCursor(raw: string | undefined): { occurredAt: number; id: string } | null {
  if (!raw) return null;
  const sep = raw.lastIndexOf("_");
  if (sep < 0) return null;
  const occurredAt = Number(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (!Number.isFinite(occurredAt) || !id) return null;
  return { occurredAt, id };
}

const activities = new Hono<{ Bindings: Env; Variables: Variables }>();

activities.use("*", authMiddleware);

activities.get("/:id/activities", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("id");
  await assertMembership(c.env.DB, projectId, user.id, "viewer");

  const limit = Math.min(Math.max(Number(c.req.query("limit")) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const cursor = parseCursor(c.req.query("cursor"));

  const { results } = await (cursor
    ? c.env.DB.prepare(
        `SELECT * FROM activities
         WHERE project_id = ? AND (occurred_at < ? OR (occurred_at = ? AND id < ?))
         ORDER BY occurred_at DESC, id DESC
         LIMIT ?`,
      ).bind(projectId, cursor.occurredAt, cursor.occurredAt, cursor.id, limit)
    : c.env.DB.prepare(
        `SELECT * FROM activities
         WHERE project_id = ?
         ORDER BY occurred_at DESC, id DESC
         LIMIT ?`,
      ).bind(projectId, limit)
  ).all<ActivityRow>();

  const last = results[results.length - 1];
  const nextCursor = results.length === limit && last ? `${last.occurred_at}_${last.id}` : null;

  return c.json({ activities: results.map(toApiActivity), nextCursor });
});

export default activities;
