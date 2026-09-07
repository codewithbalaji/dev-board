import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { apiRequest, authHeader, seedProject, seedUser } from "../helpers";

async function seedActivity(
  projectId: string,
  actorId: string,
  occurredAt: number,
  type = "task.created",
): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO activities (id, project_id, actor_id, type, entity_type, entity_id, payload, occurred_at, processed_at)
     VALUES (?, ?, ?, ?, 'task', NULL, '{}', ?, ?)`,
  )
    .bind(id, projectId, actorId, type, occurredAt, occurredAt + 1)
    .run();
  return id;
}

describe("GET /api/projects/:id/activities", () => {
  it("returns activities newest first", async () => {
    const owner = await seedUser("act-owner1@example.com");
    const { projectId } = await seedProject(owner.id);
    await seedActivity(projectId, owner.id, 1000);
    await seedActivity(projectId, owner.id, 2000);

    const res = await apiRequest(`/api/projects/${projectId}/activities`, { headers: authHeader(owner) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activities.length).toBe(2);
    expect(body.activities[0].occurredAt).toBe(2000);
    expect(body.activities[1].occurredAt).toBe(1000);
  });

  it("returns 401 without a token", async () => {
    const owner = await seedUser("act-owner2@example.com");
    const { projectId } = await seedProject(owner.id);
    const res = await apiRequest(`/api/projects/${projectId}/activities`);
    expect(res.status).toBe(401);
  });

  it("returns 404 — not 403 — to a non-member", async () => {
    const owner = await seedUser("act-owner3@example.com");
    const outsider = await seedUser("act-outsider3@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/projects/${projectId}/activities`, { headers: authHeader(outsider) });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a nonexistent project", async () => {
    const owner = await seedUser("act-owner4@example.com");
    const res = await apiRequest(`/api/projects/${crypto.randomUUID()}/activities`, { headers: authHeader(owner) });
    expect(res.status).toBe(404);
  });

  it("paginates by cursor without OFFSET, no duplicates or gaps", async () => {
    const owner = await seedUser("act-owner5@example.com");
    const { projectId } = await seedProject(owner.id);
    for (let i = 0; i < 5; i++) {
      await seedActivity(projectId, owner.id, 1000 + i);
    }

    const first = await apiRequest(`/api/projects/${projectId}/activities?limit=2`, { headers: authHeader(owner) });
    const firstBody = await first.json();
    expect(firstBody.activities.length).toBe(2);
    expect(firstBody.nextCursor).not.toBeNull();

    const second = await apiRequest(
      `/api/projects/${projectId}/activities?limit=2&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
      { headers: authHeader(owner) },
    );
    const secondBody = await second.json();
    expect(secondBody.activities.length).toBe(2);

    const seenIds = new Set([...firstBody.activities, ...secondBody.activities].map((a: { id: string }) => a.id));
    expect(seenIds.size).toBe(4);
  });

  it("sets nextCursor to null on the final page", async () => {
    const owner = await seedUser("act-owner6@example.com");
    const { projectId } = await seedProject(owner.id);
    await seedActivity(projectId, owner.id, 1000);

    const res = await apiRequest(`/api/projects/${projectId}/activities?limit=50`, { headers: authHeader(owner) });
    const body = await res.json();
    expect(body.nextCursor).toBeNull();
  });
});
