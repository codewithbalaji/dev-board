import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { ApiError } from "../lib/errors";
import { verifyJWT } from "../lib/jwt";
import { assertMembership } from "../lib/authz";

// Not mounted under authMiddleware: browsers cannot set headers on
// `new WebSocket(url)`, so this route is authenticated by a short-lived
// ws-token in the query string instead of the session JWT header.
const ws = new Hono<{ Bindings: Env; Variables: Variables }>();

ws.get("/", async (c) => {
  const projectId = c.req.query("projectId");
  const token = c.req.query("token");
  if (!projectId || !token) {
    throw new ApiError(401, "UNAUTHENTICATED", "Missing projectId or token");
  }

  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (payload.typ !== "ws") {
    throw new ApiError(401, "INVALID_TOKEN", "Wrong token type");
  }
  if (payload.projectId !== projectId) {
    throw new ApiError(403, "FORBIDDEN", "Token scope mismatch");
  }

  // 404, not 403, for a non-member — same enumeration-defense as everywhere else.
  await assertMembership(c.env.DB, projectId, payload.sub);

  const url = new URL(c.req.raw.url);
  url.searchParams.set("userId", payload.sub);
  url.searchParams.set("displayName", payload.name);
  const upgradeRequest = new Request(url, c.req.raw);

  const id = c.env.REALTIME_BOARD.idFromName(projectId);
  const stub = c.env.REALTIME_BOARD.get(id);
  return stub.fetch(upgradeRequest);
});

export default ws;
