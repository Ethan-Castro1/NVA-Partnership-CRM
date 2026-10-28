/**
 * Creates the first admin from BOOTSTRAP_ADMIN_EMAIL (and optional
 * BOOTSTRAP_ADMIN_NAME) when the users table has no admin yet. With Sign in
 * with Playlab on, the email is enough: that person signs in with the Playlab
 * account that has it. Otherwise BOOTSTRAP_ADMIN_PASSWORD sets a password.
 * Set them for the first deploy; once that admin exists they are ignored.
 */
import type { Queryable } from "./db.server";

export async function bootstrapAdminFromEnv(db: Queryable): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const { hashPassword, isPlaylabSignInEnabled } = await import("./auth.server");
  const sso = isPlaylabSignInEnabled();
  if (!email || (!sso && (!password || password === "set-me-in-duplo"))) return;
  const [{ count }] = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM users WHERE role = 'admin'",
  );
  if (count > 0) return;
  await db.query(
    "INSERT INTO users (id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, 'admin') ON CONFLICT (email) DO NOTHING",
    [
      crypto.randomUUID(),
      email,
      process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "NVA Admin",
      sso ? "playlab-sign-in" : await hashPassword(password!),
    ],
  );
  console.log("[nva] Created the first admin account from BOOTSTRAP_ADMIN_EMAIL.");
}
