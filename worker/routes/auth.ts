import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { authMiddleware } from "../middleware/auth";
import { turnstile } from "../middleware/turnstile";
import { registerIpLimit, loginIpLimit, loginEmailLimit } from "../middleware/rate-limit";
import { ApiError } from "../lib/errors";
import { signJWT } from "../lib/jwt";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../lib/password";
import { assertMembership } from "../lib/authz";
import { loginSchema, parseOrThrow, registerSchema, wsTokenSchema } from "../lib/schemas";

const WS_TOKEN_TTL_SECONDS = 5 * 60;

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  avatar_color: string;
  created_at: number;
}

function toApiUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
  };
}

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

auth.post("/register", registerIpLimit, turnstile, async (c) => {
  const { name, email, password } = parseOrThrow(registerSchema, await c.req.json());

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");

  const { hash, salt } = await hashPassword(password);
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    "INSERT INTO users (id, email, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, email, name, hash, salt)
    .run();

  const token = await signJWT({ sub: id, email, name, typ: "session" }, c.env.JWT_SECRET);
  return c.json({ user: { id, email, name, avatarColor: "neutral" }, token });
});

auth.post("/login", loginIpLimit, loginEmailLimit, turnstile, async (c) => {
  const { email, password } = parseOrThrow(loginSchema, await c.req.json());

  const row = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();

  // Always pay the PBKDF2 cost, even for a nonexistent email, so response
  // timing never reveals whether an account exists.
  const valid = row
    ? await verifyPassword(password, row.password_hash, row.password_salt)
    : await verifyPassword(password, DUMMY_PASSWORD_HASH.hash, DUMMY_PASSWORD_HASH.salt);

  if (!row || !valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  const token = await signJWT(
    { sub: row.id, email: row.email, name: row.display_name, typ: "session" },
    c.env.JWT_SECRET,
  );
  return c.json({ user: toApiUser(row), token });
});

auth.post("/ws-token", authMiddleware, async (c) => {
  const user = c.get("user");
  const { projectId } = parseOrThrow(wsTokenSchema, await c.req.json());
  await assertMembership(c.env.DB, projectId, user.id, "viewer");

  const token = await signJWT(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      typ: "ws",
      projectId,
      exp: Math.floor(Date.now() / 1000) + WS_TOKEN_TTL_SECONDS,
    },
    c.env.JWT_SECRET,
  );
  return c.json({ token });
});

auth.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first<UserRow>();
  if (!row) throw new ApiError(401, "UNAUTHENTICATED", "Session no longer valid");
  return c.json({ user: toApiUser(row) });
});

export default auth;
