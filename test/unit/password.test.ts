import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../worker/lib/password";

function toBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

describe("hashPassword / verifyPassword", () => {
  it("produces the same hash for the same password and salt", async () => {
    const { hash: hash1, salt } = await hashPassword("correct horse battery staple");
    const { hash: hash2 } = await hashPassword("correct horse battery staple", toBytes(salt));
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different (random) salts", async () => {
    const { hash: hash1 } = await hashPassword("same password");
    const { hash: hash2 } = await hashPassword("same password");
    expect(hash1).not.toBe(hash2);
  });

  it("verifies a correct password", async () => {
    const { hash, salt } = await hashPassword("hunter2222");
    await expect(verifyPassword("hunter2222", hash, salt)).resolves.toBe(true);
  });

  it("rejects a wrong password of the same length", async () => {
    const { hash, salt } = await hashPassword("hunter2222");
    await expect(verifyPassword("hunter2223", hash, salt)).resolves.toBe(false);
  });

  it("rejects a wrong password of a different length", async () => {
    const { hash, salt } = await hashPassword("hunter2222");
    await expect(verifyPassword("nope", hash, salt)).resolves.toBe(false);
  });
});
