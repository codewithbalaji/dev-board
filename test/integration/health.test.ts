import { describe, expect, it } from "vitest";
import { apiRequest } from "../helpers";

// Regression test: /api/health and /api/info must stay public. They're
// registered on the parent app, but tasks.ts's `use("*", authMiddleware)`
// gets re-based to `/api/*` once mounted at `/api` — broad enough to also
// match these two paths. Hono composes matching handlers in registration
// order, so if these routes were ever moved to register *after* the
// `app.route("/api", tasks)` mount, the auth middleware would run first and
// this test would start failing with 401.
describe("public routes stay public", () => {
  it("GET /api/health requires no auth", async () => {
    const res = await apiRequest("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  it("GET /api/info requires no auth", async () => {
    const res = await apiRequest("/api/info");
    expect(res.status).toBe(200);
  });
});
