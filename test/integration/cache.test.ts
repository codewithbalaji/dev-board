import { describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { apiRequest, authHeader, seedProject, seedUser } from "../helpers";

describe("GET /api/projects/:id/stats", () => {
  it("is a MISS then a HIT with identical bodies", async () => {
    const owner = await seedUser("cache-owner1@example.com");
    const { projectId } = await seedProject(owner.id);

    const first = await apiRequest(`/api/projects/${projectId}/stats`, { headers: authHeader(owner) });
    expect(first.status).toBe(200);
    expect(first.headers.get("X-DevBoard-Cache")).toBe("MISS");
    const firstBody = await first.json();
    expect(firstBody.stats.totalTasks).toBe(1); // seedProject seeds one task

    const second = await apiRequest(`/api/projects/${projectId}/stats`, { headers: authHeader(owner) });
    expect(second.headers.get("X-DevBoard-Cache")).toBe("HIT");
    const secondBody = await second.json();
    expect(secondBody).toEqual(firstBody);
  });

  it("returns 404 — not 403 — to a non-member", async () => {
    const owner = await seedUser("cache-owner2@example.com");
    const outsider = await seedUser("cache-outsider2@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/projects/${projectId}/stats`, { headers: authHeader(outsider) });
    expect(res.status).toBe(404);
  });

  it("degrades to BYPASS instead of 500 when KV is down", async () => {
    const owner = await seedUser("cache-owner3@example.com");
    const { projectId } = await seedProject(owner.id);

    const spy = vi.spyOn(env.KV, "get").mockRejectedValue(new Error("kv unavailable"));
    const res = await apiRequest(`/api/projects/${projectId}/stats`, { headers: authHeader(owner) });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-DevBoard-Cache")).toBe("BYPASS");
    spy.mockRestore();
  });

  it("goes back to MISS after a task mutation invalidates the cache", async () => {
    const owner = await seedUser("cache-owner4@example.com");
    const { projectId } = await seedProject(owner.id);

    await apiRequest(`/api/projects/${projectId}/stats`, { headers: authHeader(owner) });

    await apiRequest(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { ...authHeader(owner), "content-type": "application/json" },
      body: JSON.stringify({ title: "Another task" }),
    });

    const res = await apiRequest(`/api/projects/${projectId}/stats`, { headers: authHeader(owner) });
    expect(res.headers.get("X-DevBoard-Cache")).toBe("MISS");
    const body = await res.json();
    expect(body.stats.totalTasks).toBe(2);
  });
});

describe("POST /api/projects/:id/cache/purge", () => {
  it("forces the next stats read to be a MISS", async () => {
    const owner = await seedUser("cache-owner5@example.com");
    const { projectId } = await seedProject(owner.id);

    await apiRequest(`/api/projects/${projectId}/stats`, { headers: authHeader(owner) });

    const purgeRes = await apiRequest(`/api/projects/${projectId}/cache/purge`, {
      method: "POST",
      headers: authHeader(owner),
    });
    expect(purgeRes.status).toBe(200);

    const res = await apiRequest(`/api/projects/${projectId}/stats`, { headers: authHeader(owner) });
    expect(res.headers.get("X-DevBoard-Cache")).toBe("MISS");
  });

  it("returns 404 — not 403 — to a non-member", async () => {
    const owner = await seedUser("cache-owner6@example.com");
    const outsider = await seedUser("cache-outsider6@example.com");
    const { projectId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/projects/${projectId}/cache/purge`, {
      method: "POST",
      headers: authHeader(outsider),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/config", () => {
  it("returns defaults when no config keys are set", async () => {
    const res = await apiRequest("/api/config");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      announcements: [],
      maintenanceMode: "off",
      featureFlags: {},
      turnstileSiteKey: "1x00000000000000000000AA",
    });
  });

  it("returns seeded values", async () => {
    await env.KV.put("config:announcements", JSON.stringify([{ id: "1", message: "Hi" }]));
    await env.KV.put("config:maintenance_mode", "on");
    await env.KV.put("config:feature_flags", JSON.stringify({ betaBoard: true }));

    const res = await apiRequest("/api/config");
    const body = await res.json();
    expect(body.announcements).toEqual([{ id: "1", message: "Hi" }]);
    expect(body.maintenanceMode).toBe("on");
    expect(body.featureFlags).toEqual({ betaBoard: true });
  });
});
