import { describe, expect, it } from "vitest";
import { apiRequest, authHeader, seedProject, seedUser } from "../helpers";
import { signJWT } from "../../worker/lib/jwt";
import { env } from "cloudflare:workers";

describe("GET /api/ws", () => {
  it("rejects a missing projectId or token", async () => {
    const res = await apiRequest("/api/ws");
    expect(res.status).toBe(401);
  });

  it("rejects a malformed token", async () => {
    const res = await apiRequest("/api/ws?projectId=x&token=not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("rejects a session token — wrong typ", async () => {
    const owner = await seedUser("ws-owner1@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/ws?projectId=${projectId}&token=${owner.token}`);
    expect(res.status).toBe(401);
  });

  it("rejects a ws-token scoped to a different project", async () => {
    const owner = await seedUser("ws-owner2@example.com");
    const { projectId } = await seedProject(owner.id);

    const token = await signJWT(
      { sub: owner.id, email: owner.email, name: owner.name, typ: "ws", projectId: "some-other-project" },
      env.JWT_SECRET,
    );
    const res = await apiRequest(`/api/ws?projectId=${projectId}&token=${token}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 — not 403 — for a valid ws-token but a non-member", async () => {
    const owner = await seedUser("ws-owner3@example.com");
    const outsider = await seedUser("ws-outsider3@example.com");
    const { projectId } = await seedProject(owner.id);

    const token = await signJWT(
      { sub: outsider.id, email: outsider.email, name: outsider.name, typ: "ws", projectId },
      env.JWT_SECRET,
    );
    const res = await apiRequest(`/api/ws?projectId=${projectId}&token=${token}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/auth/ws-token", () => {
  it("issues a short-lived ws-scoped token for a member", async () => {
    const owner = await seedUser("ws-owner4@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest("/api/auth/ws-token", {
      method: "POST",
      headers: { ...authHeader(owner), "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
  });

  it("returns 404 — not 403 — to a non-member", async () => {
    const owner = await seedUser("ws-owner5@example.com");
    const outsider = await seedUser("ws-outsider5@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest("/api/auth/ws-token", {
      method: "POST",
      headers: { ...authHeader(outsider), "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    expect(res.status).toBe(404);
  });
});
