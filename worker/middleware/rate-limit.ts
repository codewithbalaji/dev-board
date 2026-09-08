import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { ApiError } from "../lib/errors";
import { cacheKeys } from "../lib/cache-keys";

interface RateLimitOptions {
  scope: string;
  limit: number;
  windowSeconds: number;
  // Defaults to the caller's IP. Pass this to key the counter on something
  // else instead — e.g. login is keyed on IP AND, separately, on email, so
  // an attacker can't dodge one axis by rotating the other.
  identifier?: (c: Context<{ Bindings: Env }>) => Promise<string> | string;
}

// KV-backed fixed-window counter — a deliberately approximate limiter (KV is
// eventually consistent, so a distributed attacker can drift the true count
// under it). It is the precise inner wall behind the dashboard WAF rule, not
// the whole defence — see docs/security.md §8.
export function rateLimit(opts: RateLimitOptions): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const id = opts.identifier ? await opts.identifier(c) : ip;
    const now = Math.floor(Date.now() / 1000);
    const window = Math.floor(now / opts.windowSeconds);
    const key = cacheKeys.rateLimit(opts.scope, id, window);

    const count = Number((await c.env.KV.get(key)) ?? 0);

    if (count >= opts.limit) {
      const retryAfter = (window + 1) * opts.windowSeconds - now;
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(opts.limit));
      c.header("X-RateLimit-Remaining", "0");
      throw new ApiError(429, "RATE_LIMITED", `Too many requests. Retry in ${retryAfter}s.`);
    }

    // expirationTtl covers two windows so the current bucket cannot vanish mid-window.
    c.executionCtx.waitUntil(
      c.env.KV.put(key, String(count + 1), { expirationTtl: opts.windowSeconds * 2 }),
    );
    c.header("X-RateLimit-Remaining", String(opts.limit - count - 1));
    await next();
  };
}

// Scoped to /api/auth/register and /api/auth/login only — the two routes
// Phase 7's exit criteria cover. The broader per-user mutation limits in
// docs/security.md §8 are documented but not wired up yet (see roadmap.md).
export const registerIpLimit = rateLimit({ scope: "register", limit: 3, windowSeconds: 300 });

export const loginIpLimit = rateLimit({ scope: "login-ip", limit: 5, windowSeconds: 60 });

export const loginEmailLimit = rateLimit({
  scope: "login-email",
  limit: 5,
  windowSeconds: 60,
  identifier: async (c) => {
    const { email } = await c.req.json<{ email?: string }>();
    return email?.trim().toLowerCase() ?? "unknown";
  },
});
