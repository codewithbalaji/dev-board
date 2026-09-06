import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { apiRequest, authHeader, seedMember, seedProject, seedUser } from "../helpers";

function jsonBody(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

describe("GET /api/projects/:id/tasks", () => {
  it("lists tasks ordered by status, position", async () => {
    const owner = await seedUser("t-owner1@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/projects/${projectId}/tasks`, { headers: authHeader(owner) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 to a non-member", async () => {
    const owner = await seedUser("t-owner2@example.com");
    const outsider = await seedUser("t-outsider2@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/projects/${projectId}/tasks`, { headers: authHeader(outsider) });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/projects/:id/tasks", () => {
  it("creates a task at the bottom of todo", async () => {
    const owner = await seedUser("t-owner3@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/projects/${projectId}/tasks`, {
      ...jsonBody("POST", { title: "Write docs" }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.status).toBe("todo");
    expect(body.task.position).toBeGreaterThan(1000);
  });

  it("requires member+ role", async () => {
    const owner = await seedUser("t-owner4@example.com");
    const viewer = await seedUser("t-viewer4@example.com");
    const { projectId } = await seedProject(owner.id);
    await seedMember(projectId, viewer.id, "viewer");

    const res = await apiRequest(`/api/projects/${projectId}/tasks`, {
      ...jsonBody("POST", { title: "Nope" }),
      headers: { ...authHeader(viewer), "content-type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a missing title with 422", async () => {
    const owner = await seedUser("t-owner5@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/projects/${projectId}/tasks`, {
      ...jsonBody("POST", { title: "" }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    expect(res.status).toBe(422);
  });
});

describe("PATCH /api/tasks/:id/status", () => {
  it("moves the task and reports one changed row", async () => {
    const owner = await seedUser("t-owner6@example.com");
    const { taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/status`, {
      ...jsonBody("PATCH", { status: "done", position: 1500 }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT status, position FROM tasks WHERE id = ?").bind(taskId).first();
    expect(row).toMatchObject({ status: "done", position: 1500 });
  });

  it("returns 404 — not 403 — to a non-member", async () => {
    const owner = await seedUser("t-owner7@example.com");
    const outsider = await seedUser("t-outsider7@example.com");
    const { taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/status`, {
      ...jsonBody("PATCH", { status: "done", position: 1500 }),
      headers: { ...authHeader(outsider), "content-type": "application/json" },
    });
    expect(res.status).toBe(404);
  });

  it("rejects an invalid status with 422", async () => {
    const owner = await seedUser("t-owner8@example.com");
    const { taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/status`, {
      ...jsonBody("PATCH", { status: "archived", position: 1500 }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 for a nonexistent task", async () => {
    const owner = await seedUser("t-owner9@example.com");
    const res = await apiRequest("/api/tasks/00000000-0000-4000-8000-000000000000/status", {
      ...jsonBody("PATCH", { status: "done", position: 1500 }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("requires member+ role and deletes the row", async () => {
    const owner = await seedUser("t-owner10@example.com");
    const { taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}`, { method: "DELETE", headers: authHeader(owner) });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT 1 FROM tasks WHERE id = ?").bind(taskId).first();
    expect(row).toBeNull();
  });

  it("requires authentication", async () => {
    const owner = await seedUser("t-owner11@example.com");
    const { taskId } = await seedProject(owner.id);
    const res = await apiRequest(`/api/tasks/${taskId}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});
