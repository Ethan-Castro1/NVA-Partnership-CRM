/**
 * Creates the first admin from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD
 * (and optional BOOTSTRAP_ADMIN_NAME) when the users table has no admin yet.
 * Set them as Duplo secrets for the first deploy; once that admin exists the
 * values are ignored, so they can be cleared afterwards.
 */
import type { Queryable } from "./db.server";

export async function bootstrapAdminFromEnv(db: Queryable): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password || password === "set-me-in-duplo") return;
  const [{ count }] = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM users WHERE role = 'admin'",
  );
  if (count > 0) return;
  const { hashPassword } = await import("./auth.server");
  await db.query(
    "INSERT INTO users (id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, 'admin') ON CONFLICT (email) DO NOTHING",
    [crypto.randomUUID(), email, process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "NVA Admin", await hashPassword(password)],
  );
  console.log("[nva] Created the first admin account from BOOTSTRAP_ADMIN_EMAIL.");
}
