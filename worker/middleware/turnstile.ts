import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { ApiError } from "../lib/errors";

interface TurnstileOutcome {
  success: boolean;
  "error-codes"?: string[];
}

// Verifies the client-side widget token against Cloudflare's siteverify API.
// The token alone proves nothing — only this server-side round-trip, using
// the secret key the browser never sees, does. Reads c.req.json() rather
// than c.req.raw.json() so the parsed body stays in Hono's shared cache for
// the route handler (and any other middleware) to reuse without a second
// stream read.
export const turnstile: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const { turnstileToken } = await c.req.json<{ turnstileToken?: string }>();
  if (!turnstileToken) {
    throw new ApiError(400, "TURNSTILE_MISSING", "Verification required");
  }

  const form = new FormData();
  form.append("secret", c.env.TURNSTILE_SECRET_KEY);
  form.append("response", turnstileToken);
  form.append("remoteip", c.req.header("CF-Connecting-IP") ?? "");

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const outcome = await res.json<TurnstileOutcome>();

  if (!outcome.success) {
    console.warn("turnstile failed", { errorCodes: outcome["error-codes"] });
    throw new ApiError(403, "TURNSTILE_FAILED", "Verification failed");
  }

  await next();
};
