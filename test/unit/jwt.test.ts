import { describe, expect, it } from "vitest";
import { signJWT, verifyJWT } from "../../worker/lib/jwt";

const SECRET = "test-secret";

function b64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("signJWT / verifyJWT", () => {
  it("round-trips sign -> verify", async () => {
    const token = await signJWT({ sub: "u1", email: "a@example.com", name: "A", typ: "session" }, SECRET);
    const payload = await verifyJWT(token, SECRET);
    expect(payload.sub).toBe("u1");
    expect(payload.email).toBe("a@example.com");
  });

  it("rejects a tampered payload", async () => {
    const token = await signJWT({ sub: "u1", email: "a@example.com", name: "A", typ: "session" }, SECRET);
    const [header, , signature] = token.split(".");
    const tamperedPayload = b64url({ sub: "attacker", exp: 9_999_999_999 });
    await expect(verifyJWT(`${header}.${tamperedPayload}.${signature}`, SECRET)).rejects.toThrow();
  });

  it("rejects a tampered signature", async () => {
    const token = await signJWT({ sub: "u1", email: "a@example.com", name: "A", typ: "session" }, SECRET);
    const [header, payload] = token.split(".");
    await expect(verifyJWT(`${header}.${payload}.tampered-signature`, SECRET)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await signJWT(
      { sub: "u1", email: "a@example.com", name: "A", typ: "session", exp: Math.floor(Date.now() / 1000) - 10 },
      SECRET,
    );
    await expect(verifyJWT(token, SECRET)).rejects.toThrow(/expired/i);
  });

  it("rejects the alg:none confusion attack", async () => {
    const header = b64url({ alg: "none", typ: "JWT" });
    const payload = b64url({ sub: "attacker", exp: 9_999_999_999 });
    await expect(verifyJWT(`${header}.${payload}.`, SECRET)).rejects.toThrow(/algorithm/i);
  });

  it("rejects alg:RS256", async () => {
    const header = b64url({ alg: "RS256", typ: "JWT" });
    const payload = b64url({ sub: "attacker", exp: 9_999_999_999 });
    await expect(verifyJWT(`${header}.${payload}.signature`, SECRET)).rejects.toThrow(/algorithm/i);
  });

  it("rejects a malformed token", async () => {
    await expect(verifyJWT("only.two-parts", SECRET)).rejects.toThrow(/malformed/i);
    await expect(verifyJWT("a.b.c.d", SECRET)).rejects.toThrow(/malformed/i);
  });
});
