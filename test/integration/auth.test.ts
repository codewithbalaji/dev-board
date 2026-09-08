import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, authHeader, seedUser, withTurnstile } from "../helpers";

// Rate limiting is keyed on CF-Connecting-IP, and KV storage in these tests
// is isolated per file, not per test (see docs/testing.md §3) — so every
// call needs its own simulated IP, or unrelated tests would exhaust each
// other's register/login-IP quota. Tests that deliberately exercise the
// limiter reuse one IP across their own calls.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function jsonBody(body: unknown, ip: string = nextIp()): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  };
}

// The Turnstile middleware calls out to challenges.cloudflare.com/siteverify.
// Mocked here by default so the suite is deterministic, network-independent,
// and doesn't reintroduce a timing side-channel of its own ahead of the
// password check the enumeration-parity test guards. Individual tests
// override this with mockResolvedValueOnce to exercise the failure path.
beforeEach(() => {
  // Build the Response inside the implementation, not beforeEach, so it's
  // constructed within the current request's I/O context — a Response
  // created once in a shared mockResolvedValue would belong to whichever
  // request happened to trigger construction, and Workers forbids reading
  // stream-backed I/O objects from a different request's handler.
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify({ success: true }), { headers: { "content-type": "application/json" } }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/register", () => {
  it("creates a user and returns a token", async () => {
    const res = await apiRequest(
      "/api/auth/register",
      jsonBody(withTurnstile({ name: "New User", email: "new@example.com", password: "password123" })),
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
      jsonBody(withTurnstile({ name: "Dup", email: "dup@example.com", password: "password123" })),
    );
    expect(res.status).toBe(409);
  });

  it("rejects a short password with 422", async () => {
    const res = await apiRequest(
      "/api/auth/register",
      jsonBody(withTurnstile({ name: "Short Pw", email: "shortpw@example.com", password: "short" })),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details.field).toBe("password");
  });

  it("rejects a request with no Turnstile token", async () => {
    const res = await apiRequest(
      "/api/auth/register",
      jsonBody({ name: "No Token", email: "notoken@example.com", password: "password123" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("TURNSTILE_MISSING");
  });

  it("rejects when siteverify says success:false", async () => {
    vi.mocked(globalThis.fetch).mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
          headers: { "content-type": "application/json" },
        }),
    );
    const res = await apiRequest(
      "/api/auth/register",
      jsonBody(withTurnstile({ name: "Bot", email: "bot@example.com", password: "password123" })),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("TURNSTILE_FAILED");
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    await apiRequest(
      "/api/auth/register",
      jsonBody(withTurnstile({ name: "Login User", email: "login@example.com", password: "password123" })),
    );
    const res = await apiRequest(
      "/api/auth/login",
      jsonBody(withTurnstile({ email: "login@example.com", password: "password123" })),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTypeOf("string");
  });

  it("rejects a wrong password with the generic message", async () => {
    await apiRequest(
      "/api/auth/register",
      jsonBody(withTurnstile({ name: "Wrong Pw", email: "wrongpw@example.com", password: "password123" })),
    );
    const res = await apiRequest(
      "/api/auth/login",
      jsonBody(withTurnstile({ email: "wrongpw@example.com", password: "nope12345" })),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe("Email or password is incorrect.");
  });

  it("rejects an unknown email with the identical generic message", async () => {
    const res = await apiRequest(
      "/api/auth/login",
      jsonBody(withTurnstile({ email: "nobody@example.com", password: "whatever1" })),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe("Email or password is incorrect.");
  });

  it("429s the sixth login attempt within the window", async () => {
    const attackerIp = nextIp();
    await apiRequest(
      "/api/auth/register",
      jsonBody(withTurnstile({ name: "Victim", email: "victim@example.com", password: "password123" })),
    );
    for (let i = 0; i < 5; i++) {
      const res = await apiRequest(
        "/api/auth/login",
        jsonBody(withTurnstile({ email: "victim@example.com", password: "wrong-password" }), attackerIp),
      );
      expect(res.status).toBe(401);
    }
    const sixth = await apiRequest(
      "/api/auth/login",
      jsonBody(withTurnstile({ email: "victim@example.com", password: "wrong-password" }), attackerIp),
    );
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get("Retry-After"))).toBeGreaterThan(0);
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
