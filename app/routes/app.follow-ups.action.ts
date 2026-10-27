/**
 * Resource route /app/follow-ups/action (U3): POST actions on follow-ups (complete, reschedule, new).
 * Placeholder registered by the foundation; U3 replaces this file. Admins only.
 */
import type { Route } from "./+types/app.follow-ups.action";
import { requireAdmin } from "~/lib/auth.server";

const notReady = () => Response.json({ ok: false, error: "not_implemented" }, { status: 501 });

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return notReady();
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  return notReady();
}
