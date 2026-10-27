/**
 * Resource route /app/admin/email/connect/:provider (POST): starts the OAuth
 * connection for Google or Microsoft. Admins only. Refuses in demo mode or
 * when the provider isn't configured (Settings lists what is missing).
 */
import { redirect } from "react-router";
import type { Route } from "./+types/app.admin.email.connect.$provider";
import { requireAdmin } from "~/lib/auth.server";
import { emailSetup, isEmailProvider } from "~/lib/email/config.server";
import { handshakeCookie, newState } from "~/lib/email/oauth-state.server";
import { PROVIDERS, pkcePair } from "~/lib/email/providers.server";

const SETTINGS = "/app/admin/settings/email";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  // Connecting changes state, so it only starts from the Settings form (POST).
  return redirect(SETTINGS);
}

export async function action({ request, params }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  const provider = params.provider;
  if (!isEmailProvider(provider)) throw new Response("Not found", { status: 404 });

  const setup = emailSetup();
  if (setup.demoMode) return redirect(`${SETTINGS}?error=demo`);
  if (!setup.providers.find((p) => p.provider === provider)?.ready) return redirect(`${SETTINGS}?error=notConfigured`);

  const state = newState();
  const { verifier, challenge } = pkcePair();
  const cookie = await handshakeCookie({ state, provider, verifier, userId: admin.id });
  return redirect(PROVIDERS[provider].authUrl({ state, codeChallenge: challenge }), { headers: { "Set-Cookie": cookie } });
}
