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

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProd,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
const prodCookie = createCookie("__Host-nva_session", cookieOptions);
const devCookies = new Map<string, ReturnType<typeof createCookie>>();

/**
 * The session cookie name. Production: always `__Host-nva_session`. In
 * development, browsers share cookies across localhost ports, so the name
 * carries the port (`nva_session_5173`) and parallel dev servers don't sign
 * each other out.
 */
export function sessionCookieName(request: Request): string {
  if (isProd) return "__Host-nva_session";
  const port = new URL(request.url).port;
  return port ? `nva_session_${port}` : "nva_session";
}

function sessionCookieFor(request: Request) {
  if (isProd) return prodCookie;
  const name = sessionCookieName(request);
  let cookie = devCookies.get(name);
  if (!cookie) devCookies.set(name, (cookie = createCookie(name, cookieOptions)));
  return cookie;
}

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

// ---------- brute-force guard (in memory, per 15 minutes) ----------
//
// - email + IP: the tight limit. A stranger guessing at someone's account only
//   locks themselves out, not the real person signing in from elsewhere.
// - IP: looser, since a whole school can share one address.
// - email: looser still, so guessing one account from many addresses stops too.

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LIMITS = { perEmailAndIp: 8, perIp: 30, perEmail: 30 } as const;

function tooMany(key: string, max: number): boolean {
  const entry = attempts.get(key);
  return !!entry && entry.resetAt > Date.now() && entry.count >= max;
}
function recordFailure(key: string) {
  const now = Date.now();
  // Keep the map small: drop expired entries now and then.
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}

/**
 * The visitor's IP, for rate limits. The first X-Forwarded-For entry is
 * whatever the client sent, so it is never trusted. On Vercel the edge sets
 * x-vercel-forwarded-for and x-real-ip itself; elsewhere the right-most
 * X-Forwarded-For entry is the one our own proxy added.
 */
export function clientIp(request: Request): string {
  const header = (name: string) => request.headers.get(name)?.trim() || "";
  const onVercel = !!process.env.VERCEL;
  const vercel = onVercel ? header("x-vercel-forwarded-for").split(",")[0]?.trim() : "";
  const forwarded = header("x-forwarded-for")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return vercel || header("x-real-ip") || forwarded[forwarded.length - 1] || "local";
}

export type LoginResult =
  | { ok: true; user: SessionUser; setCookie: string }
  | { ok: false; error: "auth.invalid" | "auth.tooManyAttempts" };

export async function login(request: Request, email: string, password: string): Promise<LoginResult> {
  const normalized = email.trim().toLowerCase();
  const ip = clientIp(request);
  const ipKey = `ip:${ip}`;
  const emailKey = `email:${normalized}`;
  const pairKey = `pair:${normalized}|${ip}`;
  if (
    tooMany(pairKey, LOGIN_LIMITS.perEmailAndIp) ||
    tooMany(ipKey, LOGIN_LIMITS.perIp) ||
    tooMany(emailKey, LOGIN_LIMITS.perEmail)
  )
    return { ok: false, error: "auth.tooManyAttempts" };

  const row = await queryOne<SessionUser & { password_hash: string; active: boolean }>(
    "SELECT id, email, name, role, locale, password_hash, active FROM users WHERE email = $1",
    [normalized],
  );
  dummyHash ??= hashPassword(randomBytes(12).toString("hex"));
  const valid = await verifyPassword(password, row?.password_hash ?? (await dummyHash));
  if (!row || !row.active || !valid) {
    recordFailure(pairKey);
    recordFailure(ipKey);
    recordFailure(emailKey);
    return { ok: false, error: "auth.invalid" };
  }
  attempts.delete(pairKey);

  const user: SessionUser = { id: row.id, email: row.email, name: row.name, role: row.role, locale: row.locale };
  return { ok: true, user, setCookie: await startSession(request, user.id) };
}

/** Starts a session for a user and returns the Set-Cookie header value. */
async function startSession(request: Request, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)", [hashToken(token), userId, expires]);
  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [userId]);
  await query("DELETE FROM sessions WHERE expires_at < now()");
  return sessionCookieFor(request).serialize(token);
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

// Said once per server process, so nobody leaves demo mode on by accident.
const globalForDemo = globalThis as unknown as { __nvaDemoWarned?: boolean };
if (DEMO_LOGIN && !globalForDemo.__nvaDemoWarned) {
  globalForDemo.__nvaDemoWarned = true;
  console.warn(
    "[auth] Demo login is ON (DEMO_LOGIN or SEED_DEMO is true): anyone can open /login and continue as the demo " +
      "administrator. Only use this with fictional demo data, never on a deployment with real contacts.",
  );
}

/** The seeded demo account for each role (see demo-seed.server.ts). */
export const DEMO_ACCOUNTS: Record<Role, string> = { admin: "admin@nva.test", staff: "teacher@nva.test" };

/**
 * In demo mode every visitor shares the demo accounts, so nobody may change
 * their password, role or active state (one visitor would lock out the rest).
 */
export function isLockedDemoEmail(email: string | null | undefined): boolean {
  if (!email || !isDemoLoginEnabled()) return false;
  const normalized = email.trim().toLowerCase();
  return Object.values(DEMO_ACCOUNTS).includes(normalized);
}

/** isLockedDemoEmail for an account id. */
export async function isLockedDemoAccount(userId: string): Promise<boolean> {
  if (!isDemoLoginEnabled()) return false;
  const row = await queryOne<{ email: string }>("SELECT email FROM users WHERE id = $1", [userId]);
  return isLockedDemoEmail(row?.email);
}

export type DemoLoginResult =
  | { ok: true; user: SessionUser; setCookie: string }
  | { ok: false; error: "auth.demoUnavailable" };

/** Signs in as the demo account for `role`. Refuses unless demo mode is on and that account exists. */
export async function demoLogin(request: Request, role: Role): Promise<DemoLoginResult> {
  if (!isDemoLoginEnabled() || !(role in DEMO_ACCOUNTS)) return { ok: false, error: "auth.demoUnavailable" };
  await whenReady();
  const row = await queryOne<SessionUser & { active: boolean }>(
    "SELECT id, email, name, role, locale, active FROM users WHERE email = $1",
    [DEMO_ACCOUNTS[role]],
  );
  if (!row || !row.active || row.role !== role) return { ok: false, error: "auth.demoUnavailable" };
  const user: SessionUser = { id: row.id, email: row.email, name: row.name, role: row.role, locale: row.locale };
  return { ok: true, user, setCookie: await startSession(request, user.id) };
}

export async function logout(request: Request): Promise<string> {
  const token = await readToken(request);
  if (token) await query("DELETE FROM sessions WHERE id = $1", [hashToken(token)]);
  return sessionCookieFor(request).serialize("", { maxAge: 0 });
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
  const value = await sessionCookieFor(request).parse(request.headers.get("Cookie"));
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

const REDIRECT_BASE = "http://redirect.invalid";

/**
 * Only allow same-site redirects (no open redirects). `next` must be a path
 * starting with "/". Any control character, space or backslash anywhere is
 * refused, since browsers strip or rewrite those (`/\t/evil.com` becomes
 * `//evil.com`). What's left must resolve to our own origin; the result is
 * just its path, query and hash.
 */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || /[\u0000-\u0020\u007f\\]/.test(next)) return fallback;
  let url: URL;
  try {
    url = new URL(next, REDIRECT_BASE);
  } catch {
    return fallback;
  }
  // Dot segments can collapse to "//host" (`/a/..//evil.com`), which a browser reads as another site.
  if (url.origin !== REDIRECT_BASE || url.pathname.startsWith("//")) return fallback;
  return url.pathname + url.search + url.hash;
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
