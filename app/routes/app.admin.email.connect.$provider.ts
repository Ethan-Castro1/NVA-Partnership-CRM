/**
 * Resource route /app/admin/email/connect/:provider (U6): Starts the OAuth connection for Google or Microsoft.
 * Placeholder registered by the foundation; U6 replaces this file. Admins only.
 */
import type { Route } from "./+types/app.admin.email.connect.$provider";
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
