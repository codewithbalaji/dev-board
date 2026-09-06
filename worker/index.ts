import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./env";
import { ApiError } from "./lib/errors";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const getRequestCf = (request: Request) =>
  (request as Request & { cf?: { colo?: string; region?: string } }).cf;

app.use(
  "*",
  cors({
    // No auth/credentials exist yet; tighten when Phase 2 introduces cookies/bearer tokens.
    origin: "*",
    exposeHeaders: ["X-DevBoard-Colo", "X-DevBoard-Duration"],
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

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.get("/api/info", (c) => {
  const cf = getRequestCf(c.req.raw);
  const colo = cf?.colo ?? "LOCAL";
  const region = cf?.region ?? null;
  return c.json({ colo, region, environment: c.env.ENVIRONMENT, executedAt: new Date().toISOString() });
});

export default { fetch: app.fetch };
