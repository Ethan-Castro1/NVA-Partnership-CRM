/**
 * "Sign in with Playlab": OpenID Connect against Playlab, the sign-in Easel
 * (Playlab's lab school hosting) apps use. On when PLAYLAB_URL,
 * PLAYLAB_CLIENT_ID and PLAYLAB_CLIENT_SECRET are set (Playlab staff register
 * the app at /admin/openid-clients with <APP_URL>/auth/callback); then
 * passwords are off and /login offers only this.
 *
 * Accounts are still invite-only: an admin adds the person's email and role in
 * Staff accounts, and their first Playlab sign-in with that (verified) email
 * links the account to their Playlab user id. Later sign-ins match on that id.
 * The session after sign-in is the app's own (auth.server.ts startSession).
 */
import * as client from "openid-client";
import { createCookie, redirect } from "react-router";
import { isPlaylabSignInEnabled, safeNext, startSession } from "./auth.server";
import { query, queryOne, whenReady } from "./db.server";
import type { SessionUser } from "./types";

export { isPlaylabSignInEnabled };

/** Why a Playlab sign-in was turned away (i18n keys, shown on /login). */
export const PLAYLAB_SIGN_IN_ERRORS = [
  "auth.playlab.notInvited",
  "auth.playlab.unverified",
  "auth.playlab.student",
  "auth.playlab.failed",
] as const;
export type PlaylabSignInError = (typeof PLAYLAB_SIGN_IN_ERRORS)[number];

const appUrl = () => (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
const callbackUrl = () => `${appUrl()}/auth/callback`;

let config: Promise<client.Configuration> | undefined;

/** Playlab's OpenID configuration, read once per process. */
function getConfig(): Promise<client.Configuration> {
  const issuer = process.env.PLAYLAB_URL!.replace(/\/$/, "");
  config ??= client
    .discovery(
      new URL(`${issuer}/oauth`),
      process.env.PLAYLAB_CLIENT_ID!,
      undefined,
      client.ClientSecretBasic(process.env.PLAYLAB_CLIENT_SECRET!),
      // A local Playlab runs on plain http.
      issuer.startsWith("http://") ? { execute: [client.allowInsecureRequests] } : undefined,
    )
    .catch((error) => {
      config = undefined;
      throw error;
    });
  return config;
}

// The flow's one-time values (PKCE verifier, state, where to land), for ten minutes.
// __Host- in production, so no other site or subdomain can set it.
type Flow = { verifier: string; state: string; next: string };
const flowCookie = () =>
  createCookie(appUrl().startsWith("https://") ? "__Host-nva_signin" : "nva_signin", {
    httpOnly: true,
    sameSite: "lax", // Playlab's redirect back is a top-level GET, which Lax allows.
    secure: appUrl().startsWith("https://"),
    path: "/",
    maxAge: 10 * 60,
  });

/** Sends the browser to Playlab to sign in; `next` is where to land afterwards. */
export async function startPlaylabSignIn(next: string | null): Promise<Response> {
  const verifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const url = client.buildAuthorizationUrl(await getConfig(), {
    redirect_uri: callbackUrl(),
    scope: "openid",
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    state,
  });
  const flow: Flow = { verifier, state, next: safeNext(next) };
  return redirect(url.href, { headers: { "Set-Cookie": await flowCookie().serialize(flow) } });
}

export type PlaylabSignInResult =
  | { ok: true; user: SessionUser; setCookie: string; next: string }
  | { ok: false; error: PlaylabSignInError };

/** The claims Playlab's ID token carries (attested_role only on Playlab versions that send it). */
type PlaylabClaims = { sub: string; email?: unknown; email_verified?: unknown; attested_role?: unknown };

/**
 * Matches a Playlab user to an NVA account: by the linked Playlab id, else by
 * verified email (and links it). Only active accounts; never students.
 */
export async function accountForPlaylabUser(claims: PlaylabClaims): Promise<SessionUser | PlaylabSignInError> {
  if (claims.attested_role === "student") return "auth.playlab.student";
  await whenReady();
  const columns = "id, email, name, role, locale";
  const linked = await queryOne<SessionUser & { active: boolean }>(
    `SELECT ${columns}, active FROM users WHERE playlab_id = $1`,
    [claims.sub],
  );
  if (linked) return linked.active ? strip(linked) : "auth.playlab.notInvited";

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email) return "auth.playlab.notInvited";
  if (claims.email_verified !== true) return "auth.playlab.unverified";
  // Link only an account that isn't linked to another Playlab user yet.
  const [row] = await query<SessionUser & { active: boolean }>(
    `UPDATE users SET playlab_id = $2 WHERE email = $1 AND active AND playlab_id IS NULL RETURNING ${columns}, active`,
    [email, claims.sub],
  );
  return row ? strip(row) : "auth.playlab.notInvited";
}

const strip = ({ id, email, name, role, locale }: SessionUser): SessionUser => ({ id, email, name, role, locale });

/** Playlab sends the browser back with a code; trade it for who signed in and start a session. */
export async function finishPlaylabSignIn(request: Request): Promise<PlaylabSignInResult> {
  const flow = (await flowCookie().parse(request.headers.get("Cookie"))) as Flow | null;
  // Behind the load balancer request.url says http; the callback must match APP_URL exactly.
  const url = new URL(new URL(request.url).search, callbackUrl());
  if (!flow?.verifier || !flow.state || url.searchParams.has("error")) return { ok: false, error: "auth.playlab.failed" };

  let claims: PlaylabClaims;
  try {
    const tokens = await client.authorizationCodeGrant(await getConfig(), url, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
    });
    const found = tokens.claims();
    if (!found?.sub) return { ok: false, error: "auth.playlab.failed" };
    claims = found as PlaylabClaims;
  } catch (error) {
    console.error("Playlab sign-in failed", error instanceof Error ? error.name : "error");
    return { ok: false, error: "auth.playlab.failed" };
  }

  const account = await accountForPlaylabUser(claims);
  if (typeof account === "string") return { ok: false, error: account };
  return { ok: true, user: account, setCookie: await startSession(request, account.id), next: flow.next };
}

/** Clears the flow cookie (sent with the callback's redirect). */
export function clearFlowCookie(): Promise<string> {
  return flowCookie().serialize("", { maxAge: 0 });
}
