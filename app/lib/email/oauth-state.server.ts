/**
 * The short-lived OAuth handshake: a random state (against forged callbacks),
 * the PKCE verifier and who started it, kept encrypted in an httpOnly cookie
 * for 10 minutes. The callback must match all of it.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createCookie } from "react-router";
import { isEmailProvider, type EmailProvider } from "./config.server";
import { decryptToken, encryptToken } from "./crypto.server";

const TEN_MINUTES = 10 * 60;

const oauthCookie = createCookie("nva_email_oauth", {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/app/admin/email",
  maxAge: TEN_MINUTES,
});

export type OAuthHandshake = { state: string; provider: EmailProvider; verifier: string; userId: string; expiresAt: number };

export function newState(): string {
  return randomBytes(24).toString("base64url");
}

export async function handshakeCookie(handshake: Omit<OAuthHandshake, "expiresAt">): Promise<string> {
  const value = encryptToken(JSON.stringify({ ...handshake, expiresAt: Date.now() + TEN_MINUTES * 1000 }));
  return oauthCookie.serialize(value);
}

export async function clearHandshakeCookie(): Promise<string> {
  return oauthCookie.serialize("", { maxAge: 0 });
}

/** The handshake, if the cookie is present, readable, unexpired, for this user, and its state matches. */
export async function readHandshake(request: Request, state: string | null, userId: string): Promise<OAuthHandshake | null> {
  const raw = await oauthCookie.parse(request.headers.get("Cookie"));
  if (typeof raw !== "string" || !raw || !state) return null;
  let parsed: OAuthHandshake;
  try {
    parsed = JSON.parse(decryptToken(raw)) as OAuthHandshake;
  } catch {
    return null;
  }
  if (!isEmailProvider(parsed.provider) || typeof parsed.state !== "string" || typeof parsed.verifier !== "string") return null;
  if (parsed.userId !== userId || !(parsed.expiresAt > Date.now())) return null;
  const a = Buffer.from(parsed.state);
  const b = Buffer.from(state);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return parsed;
}
