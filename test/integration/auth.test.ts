import { describe, expect, it } from "vitest";
import { apiRequest, authHeader, seedUser } from "../helpers";

function jsonBody(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

describe("POST /api/auth/register", () => {
  it("creates a user and returns a token", async () => {
    const res = await apiRequest(
      "/api/auth/register",
      jsonBody({ name: "New User", email: "new@example.com", password: "password123" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTypeOf("string");
    expect(body.user.email).toBe("new@example.com");
  });

  it("rejects a duplicate email with 409", async () => {
    await seedUser("dup@example.com");
    const res = await apiRequest(
      "/api/auth/register",
      jsonBody({ name: "Dup", email: "dup@example.com", password: "password123" }),
    );
    expect(res.status).toBe(409);
  });

  it("rejects a short password with 422", async () => {
    const res = await apiRequest(
      "/api/auth/register",
      jsonBody({ name: "Short Pw", email: "shortpw@example.com", password: "short" }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details.field).toBe("password");
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    await apiRequest(
      "/api/auth/register",
      jsonBody({ name: "Login User", email: "login@example.com", password: "password123" }),
    );
    const res = await apiRequest("/api/auth/login", jsonBody({ email: "login@example.com", password: "password123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTypeOf("string");
  });

  it("rejects a wrong password with the generic message", async () => {
    await apiRequest(
      "/api/auth/register",
      jsonBody({ name: "Wrong Pw", email: "wrongpw@example.com", password: "password123" }),
    );
    const res = await apiRequest("/api/auth/login", jsonBody({ email: "wrongpw@example.com", password: "nope12345" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe("Email or password is incorrect.");
  });

  it("rejects an unknown email with the identical generic message", async () => {
    const res = await apiRequest("/api/auth/login", jsonBody({ email: "nobody@example.com", password: "whatever1" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe("Email or password is incorrect.");
  });
});

describe("GET /api/auth/me", () => {
  it("requires authentication", async () => {
    const res = await apiRequest("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user with a valid token", async () => {
    const user = await seedUser("me@example.com");
    const res = await apiRequest("/api/auth/me", { headers: authHeader(user) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("me@example.com");
  });
});
