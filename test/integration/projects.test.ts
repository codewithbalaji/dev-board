import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { apiRequest, authHeader, seedProject, seedUser } from "../helpers";

function jsonBody(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

describe("GET /api/projects", () => {
  it("lists only projects the user is a member of", async () => {
    const owner = await seedUser("owner1@example.com");
    const outsider = await seedUser("outsider1@example.com");
    await seedProject(owner.id, "Alpha");

    const res = await apiRequest("/api/projects", { headers: authHeader(owner) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(1);

    const outsiderRes = await apiRequest("/api/projects", { headers: authHeader(outsider) });
    const outsiderBody = await outsiderRes.json();
    expect(outsiderBody.projects).toHaveLength(0);
  });

  it("requires authentication", async () => {
    const res = await apiRequest("/api/projects");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/projects", () => {
  it("creates a project and the owner membership row in one batch", async () => {
    const owner = await seedUser("creator@example.com");
    const res = await apiRequest("/api/projects", {
      ...jsonBody("POST", { name: "Acme Redesign" }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.name).toBe("Acme Redesign");

    const projectRow = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(body.project.id).first();
    expect(projectRow).toBeTruthy();
    const memberRow = await env.DB.prepare(
      "SELECT role FROM project_members WHERE project_id = ? AND user_id = ?",
    )
      .bind(body.project.id, owner.id)
      .first<{ role: string }>();
    expect(memberRow?.role).toBe("owner");
  });

  it("rejects an empty name with 422", async () => {
    const owner = await seedUser("empty-name@example.com");
    const res = await apiRequest("/api/projects", {
      ...jsonBody("POST", { name: "" }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/projects/:id", () => {
  it("returns 404 — not 403 — to a non-member", async () => {
    const owner = await seedUser("owner2@example.com");
    const outsider = await seedUser("outsider2@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/projects/${projectId}`, { headers: authHeader(outsider) });
    expect(res.status).toBe(404);
  });

  it("returns the project with a memberCount for a member", async () => {
    const owner = await seedUser("owner3@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/projects/${projectId}`, { headers: authHeader(owner) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.memberCount).toBe(1);
  });

  it("returns 404 for a nonexistent project", async () => {
    const owner = await seedUser("owner4@example.com");
    const res = await apiRequest("/api/projects/00000000-0000-4000-8000-000000000000", {
      headers: authHeader(owner),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/projects/:id", () => {
  it("requires admin+ role", async () => {
    const owner = await seedUser("owner5@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/projects/${projectId}`, {
      ...jsonBody("PATCH", { name: "Renamed" }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.name).toBe("Renamed");
  });
});

describe("DELETE /api/projects/:id", () => {
  it("requires owner role and cascades", async () => {
    const owner = await seedUser("owner6@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/projects/${projectId}`, {
      method: "DELETE",
      headers: authHeader(owner),
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT 1 FROM projects WHERE id = ?").bind(projectId).first();
    expect(row).toBeNull();
  });
});
