import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { authMiddleware } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { signJWT } from "../lib/jwt";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../lib/password";
import { loginSchema, parseOrThrow, registerSchema } from "../lib/schemas";

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

auth.post("/register", async (c) => {
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

auth.post("/login", async (c) => {
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

auth.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first<UserRow>();
  if (!row) throw new ApiError(401, "UNAUTHENTICATED", "Session no longer valid");
  return c.json({ user: toApiUser(row) });
});

export default auth;
