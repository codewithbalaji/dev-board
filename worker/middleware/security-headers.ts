import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";

// connect-src is environment-conditional: production terminates the
// WebSocket on wss://*.devboard.app, but local/staging dev proxies it
// through the Vite dev server's own localhost origin (vite.config.ts's
// server.proxy, ws: true). Getting this wrong doesn't throw a CSP-labeled
// error — the WebSocket just silently fails to connect.
function buildCsp(environment: Env["ENVIRONMENT"]): string {
  const connectSrc =
    environment === "production"
      ? "connect-src 'self' wss://*.devboard.app"
      : "connect-src 'self' ws://localhost:* wss://localhost:*";

  return [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'", // Tailwind injects styles at runtime
    "img-src 'self' data: blob:", // attachment previews
    "font-src 'self' data:", // Inter is bundled, not from a CDN
    connectSrc,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// Runs on every response, including thrown ApiErrors — Hono's onError fires
// inside the same dispatch chain and doesn't reject `next()`, so the code
// below still executes and context.header() still attaches to the
// already-finalized error response.
export const securityHeaders: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  await next();
  c.header("Content-Security-Policy", buildCsp(c.env.ENVIRONMENT));
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
};
