/**
 * Resource route /app/saved (F2): POST toggles a saved contact (people the viewer can see only).
 * Placeholder registered by the foundation; F2 replaces this file. Signed-in staff and admins.
 */
import type { Route } from "./+types/app.saved";
import { requireUser } from "~/lib/auth.server";

const notReady = () => Response.json({ ok: false, error: "not_implemented" }, { status: 501 });

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return notReady();
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  return notReady();
}
