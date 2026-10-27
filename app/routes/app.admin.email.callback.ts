/**
 * Resource route /app/admin/email/callback: where Google or Microsoft send the
 * admin back after they approve access. Checks the state and PKCE handshake,
 * trades the code for tokens, stores the refresh token encrypted, runs a first
 * sync and returns to Settings. Admins only. Token values are never logged.
 */
import { redirect } from "react-router";
import type { Route } from "./+types/app.admin.email.callback";
import { requireAdmin } from "~/lib/auth.server";
import { saveConnectedAccount } from "~/lib/email/accounts.server";
import { emailSetup } from "~/lib/email/config.server";
import { clearHandshakeCookie, readHandshake } from "~/lib/email/oauth-state.server";
import { PROVIDERS } from "~/lib/email/providers.server";
import { syncAccount } from "~/lib/email/sync.server";

const SETTINGS = "/app/admin/settings/email";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  const url = new URL(request.url);
  const clear = { "Set-Cookie": await clearHandshakeCookie() };
  const back = (query: string) => redirect(`${SETTINGS}?${query}`, { headers: clear });

  const handshake = await readHandshake(request, url.searchParams.get("state"), admin.id);
  if (!handshake) return back("error=state");
  if (url.searchParams.get("error")) return back("error=denied");
  const code = url.searchParams.get("code");
  if (!code) return back("error=failed");

  const setup = emailSetup();
  if (setup.demoMode) return back("error=demo");
  if (!setup.providers.find((p) => p.provider === handshake.provider)?.ready) return back("error=notConfigured");

  const api = PROVIDERS[handshake.provider];
  let accountId: string;
  try {
    const tokens = await api.exchangeCode(code, handshake.verifier);
    if (!tokens.refreshToken) return back("error=noRefresh");
    const emailAddress = await api.accountEmail(tokens.accessToken);
    accountId = await saveConnectedAccount({
      provider: handshake.provider,
      emailAddress,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
      connectedBy: admin.id,
    });
  } catch (error) {
    console.error("Email connect failed", error instanceof Error ? error.message : "error");
    return back("error=failed");
  }
  // First sync now, so email history shows up right away. A failure here is shown on the account.
  await syncAccount(accountId).catch(() => undefined);
  return back(`connected=${handshake.provider}`);
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  return new Response("Method not allowed", { status: 405 });
}
