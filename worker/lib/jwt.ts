import { ApiError } from "./errors";

const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24h

export interface JWTPayload {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
  typ: "session" | "ws";
  projectId?: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBase64(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return padded + "=".repeat(padLength);
}

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(base64UrlToBase64(value));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson(value: string): unknown {
  return JSON.parse(atob(base64UrlToBase64(value)));
}

async function importHmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signJWT(
  claims: Omit<JWTPayload, "iat" | "exp"> & { exp?: number },
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    ...claims,
    iat: now,
    exp: claims.exp ?? now + SESSION_TTL_SECONDS,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = encodeJson(header);
  const payloadB64 = encodeJson(payload);
  const key = await importHmacKey(secret, "sign");
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new ApiError(401, "INVALID_TOKEN", "Malformed token");
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: unknown;
  try {
    header = decodeJson(headerB64);
  } catch {
    throw new ApiError(401, "INVALID_TOKEN", "Malformed token");
  }
  if (
    typeof header !== "object" ||
    header === null ||
    (header as { alg?: unknown }).alg !== "HS256"
  ) {
    throw new ApiError(401, "INVALID_TOKEN", "Bad algorithm");
  }

  const key = await importHmacKey(secret, "verify");
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) throw new ApiError(401, "INVALID_TOKEN", "Bad signature");

  let payload: JWTPayload;
  try {
    payload = decodeJson(payloadB64) as JWTPayload;
  } catch {
    throw new ApiError(401, "INVALID_TOKEN", "Malformed token");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new ApiError(401, "TOKEN_EXPIRED", "Session expired");
  }

  return payload;
}
