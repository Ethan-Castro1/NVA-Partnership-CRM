/**
 * Personal keys for the MCP connector. A key is shown once, when it's made;
 * the database keeps only its SHA-256, like session tokens. Anyone with the
 * connector URL can search as that staff member, so people can revoke keys.
 */
import { createHash, randomBytes } from "node:crypto";
import { query, queryOne } from "./db.server";
import type { SessionUser } from "./types";

export type McpKeySummary = { id: string; label: string; created_at: string; last_used_at: string | null };

const hash = (key: string) => createHash("sha256").update(key).digest("hex");
const KEY_RE = /^nva_[A-Za-z0-9_-]{32,64}$/;
/** Enough for a few devices and apps; old ones can be revoked. */
export const MAX_KEYS_PER_USER = 10;

export async function listMcpKeys(userId: string): Promise<McpKeySummary[]> {
  return query<McpKeySummary>(
    "SELECT id, label, created_at, last_used_at FROM mcp_keys WHERE user_id = $1 ORDER BY created_at DESC",
    [userId],
  );
}

/** Makes a key and returns it in full (the only time it exists outside the person's app). */
export async function createMcpKey(userId: string, label: string): Promise<string | null> {
  const count = (await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM mcp_keys WHERE user_id = $1", [userId]))?.n ?? 0;
  if (count >= MAX_KEYS_PER_USER) return null;
  const key = `nva_${randomBytes(24).toString("base64url")}`;
  await query("INSERT INTO mcp_keys (id, user_id, label) VALUES ($1, $2, $3)", [hash(key), userId, label.trim().slice(0, 80) || "Connector"]);
  return key;
}

export async function revokeMcpKey(userId: string, id: string): Promise<void> {
  await query("DELETE FROM mcp_keys WHERE id = $1 AND user_id = $2", [id, userId]);
}

/** The active staff member a key belongs to, or null. */
export async function userForMcpKey(key: string): Promise<SessionUser | null> {
  if (!KEY_RE.test(key)) return null;
  const id = hash(key);
  const user = await queryOne<SessionUser>(
    `SELECT u.id, u.email, u.name, u.role, u.locale FROM mcp_keys k JOIN users u ON u.id = k.user_id
      WHERE k.id = $1 AND u.active`,
    [id],
  );
  if (user) await query("UPDATE mcp_keys SET last_used_at = now() WHERE id = $1", [id]);
  return user;
}
