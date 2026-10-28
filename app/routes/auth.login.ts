import { redirect } from "react-router";
import type { Route } from "./+types/auth.login";
import { isPlaylabSignInEnabled, startPlaylabSignIn } from "~/lib/playlab-sign-in.server";

/** Starts "Sign in with Playlab" (the /login button). Without it configured, back to /login. */
export async function loader({ request }: Route.LoaderArgs) {
  if (!isPlaylabSignInEnabled()) return redirect("/login");
  try {
    return await startPlaylabSignIn(new URL(request.url).searchParams.get("next"));
  } catch (error) {
    console.error("Playlab sign-in could not start", error instanceof Error ? error.name : "error");
    return redirect("/login?error=auth.playlab.failed");
  }
}
