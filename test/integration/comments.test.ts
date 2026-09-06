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

describe("GET /api/tasks/:id/comments", () => {
  it("lists comments oldest-first", async () => {
    const owner = await seedUser("c-owner1@example.com");
    const { taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/comments`, { headers: authHeader(owner) });
    expect(res.status).toBe(200);
  });

  it("returns 404 to a non-member", async () => {
    const owner = await seedUser("c-owner2@example.com");
    const outsider = await seedUser("c-outsider2@example.com");
    const { taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/comments`, { headers: authHeader(outsider) });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/tasks/:id/comments", () => {
  it("creates a comment", async () => {
    const owner = await seedUser("c-owner3@example.com");
    const { taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/comments`, {
      ...jsonBody("POST", { body: "Looks good to me." }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.comment.body).toBe("Looks good to me.");
  });

  it("rejects an empty body with 422", async () => {
    const owner = await seedUser("c-owner4@example.com");
    const { taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/comments`, {
      ...jsonBody("POST", { body: "" }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    expect(res.status).toBe(422);
  });

  it("requires member+ role", async () => {
    const owner = await seedUser("c-owner5@example.com");
    const viewer = await seedUser("c-viewer5@example.com");
    const { projectId, taskId } = await seedProject(owner.id);
    await seedMember(projectId, viewer.id, "viewer");

    const res = await apiRequest(`/api/tasks/${taskId}/comments`, {
      ...jsonBody("POST", { body: "Nope" }),
      headers: { ...authHeader(viewer), "content-type": "application/json" },
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/comments/:id", () => {
  it("lets the author delete their own comment", async () => {
    const owner = await seedUser("c-owner6@example.com");
    const { taskId } = await seedProject(owner.id);

    const createRes = await apiRequest(`/api/tasks/${taskId}/comments`, {
      ...jsonBody("POST", { body: "Delete me" }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    const { comment } = await createRes.json();

    const res = await apiRequest(`/api/comments/${comment.id}`, { method: "DELETE", headers: authHeader(owner) });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT 1 FROM comments WHERE id = ?").bind(comment.id).first();
    expect(row).toBeNull();
  });

  it("forbids a non-author member+ below admin from deleting", async () => {
    const owner = await seedUser("c-owner7@example.com");
    const member = await seedUser("c-member7@example.com");
    const { projectId, taskId } = await seedProject(owner.id);
    await seedMember(projectId, member.id, "member");

    const createRes = await apiRequest(`/api/tasks/${taskId}/comments`, {
      ...jsonBody("POST", { body: "Owner's comment" }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    const { comment } = await createRes.json();

    const res = await apiRequest(`/api/comments/${comment.id}`, { method: "DELETE", headers: authHeader(member) });
    expect(res.status).toBe(403);
  });

  it("returns 404 for a nonexistent comment", async () => {
    const owner = await seedUser("c-owner8@example.com");
    const res = await apiRequest("/api/comments/00000000-0000-4000-8000-000000000000", {
      method: "DELETE",
      headers: authHeader(owner),
    });
    expect(res.status).toBe(404);
  });
});
