const ITERATIONS = 100_000; // OWASP floor for PBKDF2-SHA256
const KEY_LENGTH = 32; // bytes
const SALT_LENGTH = 16; // bytes, unique per user

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPassword(
  password: string,
  salt?: Uint8Array,
): Promise<{ hash: string; salt: string }> {
  const saltBytes = salt ?? crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH * 8,
  );
  return { hash: toBase64(new Uint8Array(bits)), salt: toBase64(saltBytes) };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  const { hash } = await hashPassword(password, fromBase64(storedSalt));
  return timingSafeEqual(hash, storedHash);
}

// Used by the login route so a request against a nonexistent email still pays
// the full PBKDF2 cost — timing must not distinguish "no such user" from
// "wrong password".
export const DUMMY_PASSWORD_HASH = {
  hash: toBase64(new Uint8Array(KEY_LENGTH)),
  salt: toBase64(new Uint8Array(SALT_LENGTH)),
};
