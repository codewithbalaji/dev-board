import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { signJWT } from "../worker/lib/jwt";
import type { Role } from "../worker/lib/authz";
import { hashPassword } from "../worker/lib/password";

export interface TestUser {
  id: string;
  email: string;
  name: string;
  token: string;
}

export async function seedUser(email: string, name = "Test User"): Promise<TestUser> {
  const id = crypto.randomUUID();
  const { hash, salt } = await hashPassword("password123");
  await env.DB.prepare(
    "INSERT INTO users (id, email, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, email, name, hash, salt)
    .run();
  const token = await signJWT({ sub: id, email, name, typ: "session" }, env.JWT_SECRET);
  return { id, email, name, token };
}

export async function seedProject(
  ownerId: string,
  name = "Test Project",
): Promise<{ projectId: string; taskId: string }> {
  const projectId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const slug = `test-project-${projectId.slice(0, 8)}`;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO projects (id, name, slug, owner_id) VALUES (?, ?, ?, ?)").bind(
      projectId,
      name,
      slug,
      ownerId,
    ),
    env.DB.prepare("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner')").bind(
      projectId,
      ownerId,
    ),
    env.DB.prepare("INSERT INTO tasks (id, project_id, title, created_by) VALUES (?, ?, 'Seed task', ?)").bind(
      taskId,
      projectId,
      ownerId,
    ),
  ]);
  return { projectId, taskId };
}

export async function seedMember(projectId: string, userId: string, role: Role = "member"): Promise<void> {
  await env.DB.prepare("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)")
    .bind(projectId, userId, role)
    .run();
}

export function authHeader(user: TestUser): Record<string, string> {
  return { Authorization: `Bearer ${user.token}` };
}

export async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await exports.default.fetch(new Request(`https://test.local${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
