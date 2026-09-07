import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./env";
import { ApiError } from "./lib/errors";
import auth from "./routes/auth";
import projects from "./routes/projects";
import tasks from "./routes/tasks";
import attachments from "./routes/attachments";
import activities from "./routes/activities";
import config from "./routes/config";
import ws from "./routes/ws";
import { handleActivityBatch } from "./queue/consumer";
import type { ActivityMessage } from "./lib/activity";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const getRequestCf = (request: Request) =>
  (request as Request & { cf?: { colo?: string; region?: string } }).cf;

app.use(
  "*",
  cors({
    // Bearer tokens in a header, not cookies, so a wildcard origin stays safe — no CSRF surface.
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["X-DevBoard-Colo", "X-DevBoard-Duration", "X-DevBoard-Cache"],
  }),
);

app.use("*", async (c, next) => {
  c.set("requestStart", Date.now());
  await next();
  const duration = Date.now() - c.get("requestStart");
  // request.cf is undefined in local dev — never read it unguarded.
  const colo = getRequestCf(c.req.raw)?.colo ?? "LOCAL";
  c.res.headers.set("X-DevBoard-Duration", `${duration}`);
  c.res.headers.set("X-DevBoard-Colo", String(colo));
});

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  console.error("unhandled", err);
  return c.json({ error: { code: "INTERNAL", message: "Something went wrong" } }, 500);
});

// Registered before the route mounts below: Hono composes all matching
// handlers for a request in registration order, and `tasks.use("*", ...)`
// gets re-based to `/api/*` once mounted — broad enough to also match these
// two public paths. Registering the public handlers first means they resolve
// (and stop the chain) before that auth middleware ever runs.
app.get("/api/health", (c) => c.json({ status: "ok" }));

app.get("/api/info", (c) => {
  const cf = getRequestCf(c.req.raw);
  const colo = cf?.colo ?? "LOCAL";
  const region = cf?.region ?? null;
  return c.json({ colo, region, environment: c.env.ENVIRONMENT, executedAt: new Date().toISOString() });
});

// Public, unauthenticated — registered before tasks/attachments below so
// their `use("*", authMiddleware)` (re-based to `/api/*` once mounted) never
// gets a chance to intercept it. Same registration-order rule that bit
// /api/health and /api/info in Phase 2.
app.route("/api/config", config);

// Authenticated by a query-string ws-token, not the Authorization header —
// registered before tasks/attachments below for the same registration-order
// reason as /api/health and /api/info.
app.route("/api/ws", ws);

app.route("/api/auth", auth);
app.route("/api/projects", projects);
app.route("/api/projects", activities);
app.route("/api", tasks);
app.route("/api", attachments);

export default {
  fetch: app.fetch,
  queue: handleActivityBatch,
} satisfies ExportedHandler<Env, ActivityMessage>;
export { RealtimeBoard } from "./durable-objects/RealtimeBoard";
