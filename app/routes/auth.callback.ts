import { redirect } from "react-router";
import type { Route } from "./+types/auth.callback";
import { canAccessPath } from "~/lib/permissions.server";
import { clearFlowCookie, finishPlaylabSignIn, isPlaylabSignInEnabled } from "~/lib/playlab-sign-in.server";

/** Playlab sends people back here after they sign in (register <APP_URL>/auth/callback with Playlab). */
export async function loader({ request }: Route.LoaderArgs) {
  if (!isPlaylabSignInEnabled()) return redirect("/login");
  const result = await finishPlaylabSignIn(request);
  const headers = new Headers({ "Set-Cookie": await clearFlowCookie() });
  if (!result.ok) return redirect(`/login?error=${result.error}`, { headers });
  headers.append("Set-Cookie", result.setCookie);
  return redirect(canAccessPath(result.user.role, result.next) ? result.next : "/app", { headers });
}
