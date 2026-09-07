import type { Context } from "hono";
import type { Env, Variables } from "../env";

type CacheContext = Context<{ Bindings: Env; Variables: Variables }>;

// Cache-aside: KV down degrades to BYPASS and recomputes — a cache must
// never turn into a 500. The write is fire-and-forget via waitUntil so a
// cold cache never costs the requester the extra latency.
export async function cacheAside<T>(
  c: CacheContext,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  let cached: T | null = null;
  try {
    cached = await c.env.KV.get<T>(key, "json");
  } catch (err) {
    console.error("kv read failed", { key, error: String(err) });
    c.set("cacheStatus", "BYPASS");
    return compute();
  }

  if (cached !== null) {
    c.set("cacheStatus", "HIT");
    return cached;
  }

  c.set("cacheStatus", "MISS");
  const fresh = await compute();
  c.executionCtx.waitUntil(
    c.env.KV.put(key, JSON.stringify(fresh), { expirationTtl: ttlSeconds }).catch((err) => {
      console.error("kv write failed", { key, error: String(err) });
    }),
  );
  return fresh;
}
