import type { MiddlewareHandler } from "hono";
import type { Env, Variables } from "../env";
import { ApiError } from "../lib/errors";
import { verifyJWT } from "../lib/jwt";

export const authMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next,
) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(401, "UNAUTHENTICATED", "Missing session");
  }
  const token = header.slice("Bearer ".length);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  c.set("user", { id: payload.sub, email: payload.email, name: payload.name });
  await next();
};
