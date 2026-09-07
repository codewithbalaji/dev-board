import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { configKeys } from "../lib/cache-keys";

interface FeatureFlags {
  [key: string]: boolean;
}

const config = new Hono<{ Bindings: Env; Variables: Variables }>();

// Public by design — no auth middleware. Operator-managed values only
// (announcements, maintenance mode, feature flags), never user data.
config.get("/", async (c) => {
  const [announcements, maintenanceMode, featureFlags] = await Promise.all([
    c.env.KV.get<{ id: string; message: string }[]>(configKeys.announcements, "json"),
    c.env.KV.get(configKeys.maintenanceMode, "text"),
    c.env.KV.get<FeatureFlags>(configKeys.featureFlags, "json"),
  ]);

  return c.json({
    announcements: announcements ?? [],
    maintenanceMode: maintenanceMode === "on" ? "on" : "off",
    featureFlags: featureFlags ?? {},
  });
});

export default config;
