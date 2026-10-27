/**
 * Refresh tokens are encrypted at rest with AES-256-GCM (node:crypto).
 *
 * EMAIL_TOKEN_KEY is 32 random bytes, written as 64 hex characters or as
 * base64 (make one with `openssl rand -base64 32`). The stored value is
 * "v1.<iv>.<tag>.<ciphertext>" in base64url, so a wrong key or a changed byte
 * fails to decrypt instead of returning garbage. Email passwords are never
 * asked for or stored: providers hand the app a revocable OAuth token.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
export const TOKEN_KEY_VERSION = 1;

/** The key from its text form, or null when it isn't exactly 32 bytes. */
export function parseTokenKey(raw: string | undefined | null): Buffer | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, "hex");
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) {
    const bytes = Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (bytes.length === 32) return bytes;
  }
  return null;
}

function keyFromEnv(): Buffer {
  const key = parseTokenKey(process.env.EMAIL_TOKEN_KEY);
  if (!key) throw new Error("EMAIL_TOKEN_KEY is missing or is not 32 bytes");
  return key;
}

export function encryptToken(plain: string, key: Buffer = keyFromEnv()): string {
  if (key.length !== 32) throw new Error("Token key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptToken(stored: string, key: Buffer = keyFromEnv()): string {
  const [version, ivText, tagText, dataText] = stored.split(".");
  if (version !== VERSION || !ivText || !tagText || dataText === undefined) throw new Error("Unreadable token");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
}
