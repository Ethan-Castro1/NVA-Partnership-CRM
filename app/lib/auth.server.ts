/**
 * Email + password sign-in for NVA staff. No SSO, no public sign-up: an admin
 * creates each account (or BOOTSTRAP_ADMIN_* creates the first one).
 *
 * - Passwords: scrypt with a per-user salt (node:crypto, no extra deps).
 * - Sessions: a random 32-byte token in an httpOnly cookie; the database keeps
 *   only its SHA-256, so a leaked sessions table can't sign anyone in.
 * - Cookies are SameSite=Lax, which blocks cross-site form posts.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createCookie, redirect } from "react-router";
import type { Role } from "./constants";
import type { SessionUser } from "./types";
import { newId, query, queryOne, whenReady } from "./db.server";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_DAYS = 14;
export const MIN_PASSWORD_LENGTH = 10;

export type { SessionUser } from "./types";

const isProd = process.env.NODE_ENV === "production";

const sessionCookie = createCookie(isProd ? "__Host-nva_session" : "nva_session", {
  httpOnly: true,
  sameSite: "lax",
  secure: isProd,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
});

// ---------- passwords ----------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Returns an i18n key under `auth.` when the password is too weak, else null. */
export function passwordProblem(password: string): "auth.passwordTooShort" | null {
  return password.length < MIN_PASSWORD_LENGTH ? "auth.passwordTooShort" : null;
}

// A real hash to compare against when the email doesn't exist, so a wrong
// email and a wrong password take the same time.
let dummyHash: Promise<string> | undefined;

// ---------- brute-force guard (per email and per IP, in memory) ----------

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function tooMany(key: string): boolean {
  const entry = attempts.get(key);
  return !!entry && entry.resetAt > Date.now() && entry.count >= MAX_ATTEMPTS;
}
function recordFailure(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

export type LoginResult =
  | { ok: true; user: SessionUser; setCookie: string }
  | { ok: false; error: "auth.invalid" | "auth.tooManyAttempts" };

export async function login(request: Request, email: string, password: string): Promise<LoginResult> {
  const normalized = email.trim().toLowerCase();
  const ipKey = `ip:${clientIp(request)}`;
  const emailKey = `email:${normalized}`;
  if (tooMany(ipKey) || tooMany(emailKey)) return { ok: false, error: "auth.tooManyAttempts" };

  const row = await queryOne<SessionUser & { password_hash: string; active: boolean }>(
    "SELECT id, email, name, role, locale, password_hash, active FROM users WHERE email = $1",
    [normalized],
  );
  dummyHash ??= hashPassword(randomBytes(12).toString("hex"));
  const valid = await verifyPassword(password, row?.password_hash ?? (await dummyHash));
  if (!row || !row.active || !valid) {
    recordFailure(ipKey);
    recordFailure(emailKey);
    return { ok: false, error: "auth.invalid" };
  }
  attempts.delete(emailKey);

  const user: SessionUser = { id: row.id, email: row.email, name: row.name, role: row.role, locale: row.locale };
  return { ok: true, user, setCookie: await startSession(user.id) };
}

/** Starts a session for a user and returns the Set-Cookie header value. */
async function startSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)", [hashToken(token), userId, expires]);
  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [userId]);
  await query("DELETE FROM sessions WHERE expires_at < now()");
  return sessionCookie.serialize(token);
}

// ---------- demo sign-in ----------

/**
 * Demo mode (DEMO_LOGIN=true, or a SEED_DEMO deployment): /login shows
 * "Continue as Administrator / Continue as Staff", which start a real session
 * for the fictional demo account of that role. Never set it on a real deployment.
 */
export function isDemoLoginEnabled(): boolean {
  return process.env.DEMO_LOGIN === "true" || process.env.SEED_DEMO === "true";
}
export const DEMO_LOGIN = isDemoLoginEnabled();

/** The seeded demo account for each role (see demo-seed.server.ts). */
export const DEMO_ACCOUNTS: Record<Role, string> = { admin: "admin@nva.test", staff: "teacher@nva.test" };

export type DemoLoginResult =
  | { ok: true; user: SessionUser; setCookie: string }
  | { ok: false; error: "auth.demoUnavailable" };

/** Signs in as the demo account for `role`. Refuses unless demo mode is on and that account exists. */
export async function demoLogin(_request: Request, role: Role): Promise<DemoLoginResult> {
  if (!isDemoLoginEnabled() || !(role in DEMO_ACCOUNTS)) return { ok: false, error: "auth.demoUnavailable" };
  await whenReady();
  const row = await queryOne<SessionUser & { active: boolean }>(
    "SELECT id, email, name, role, locale, active FROM users WHERE email = $1",
    [DEMO_ACCOUNTS[role]],
  );
  if (!row || !row.active || row.role !== role) return { ok: false, error: "auth.demoUnavailable" };
  const user: SessionUser = { id: row.id, email: row.email, name: row.name, role: row.role, locale: row.locale };
  return { ok: true, user, setCookie: await startSession(user.id) };
}

export async function logout(request: Request): Promise<string> {
  const token = await readToken(request);
  if (token) await query("DELETE FROM sessions WHERE id = $1", [hashToken(token)]);
  return sessionCookie.serialize("", { maxAge: 0 });
}

/** Signs a user out everywhere (after a password change or deactivation). */
export async function endAllSessions(userId: string, exceptRequest?: Request): Promise<void> {
  const keep = exceptRequest ? await readToken(exceptRequest) : null;
  if (keep) await query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [userId, hashToken(keep)]);
  else await query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function readToken(request: Request): Promise<string | null> {
  const value = await sessionCookie.parse(request.headers.get("Cookie"));
  return typeof value === "string" && value.length > 20 ? value : null;
}

// ---------- reading the signed-in user ----------

export async function getUser(request: Request): Promise<SessionUser | null> {
  await whenReady();
  const token = await readToken(request);
  if (!token) return null;
  return queryOne<SessionUser>(
    `SELECT u.id, u.email, u.name, u.role, u.locale
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now() AND u.active`,
    [hashToken(token)],
  );
}

/** For staff pages: the signed-in user, or a redirect to /login?next=... */
export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await getUser(request);
  if (!user) {
    const url = new URL(request.url);
    const next = url.pathname + url.search;
    throw redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  return user;
}

/**
 * For admin pages and admin-only actions. Staff get a 403, which the error
 * page shows as "Only admins can do that" with a link back to /app.
 */
export async function requireAdmin(request: Request): Promise<SessionUser> {
  const user = await requireUser(request);
  if (user.role !== "admin") throw new Response("Admins only", { status: 403, statusText: "Forbidden" });
  return user;
}

/** Only allow same-site relative redirects after login (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

// ---------- accounts ----------

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
  locale?: "en" | "es";
}): Promise<string> {
  const id = newId();
  await query(
    "INSERT INTO users (id, email, name, password_hash, role, locale) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, input.email.trim().toLowerCase(), input.name.trim(), await hashPassword(input.password), input.role, input.locale ?? "en"],
  );
  return id;
}

export async function setPassword(userId: string, password: string): Promise<void> {
  await query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, await hashPassword(password)]);
}
