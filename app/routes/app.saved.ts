/**
 * Resource route /app/saved: a signed-in user's saved resources.
 * GET returns the people they saved and can still see.
 * POST personId with intent=save|unsave|toggle (default toggle) and an optional
 * note. Staff can save only people in the staff directory; anyone else is a 404,
 * the same as a missing person. Admins can save anyone.
 */
import type { Route } from "./+types/app.saved";
import { requireUser } from "~/lib/auth.server";
import { listSaved, setSaved } from "~/lib/saved.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return Response.json({ saved: await listSaved(user) });
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  if (request.method !== "POST") return Response.json({ ok: false, error: "method" }, { status: 405 });
  const form = await request.formData();
  const personId = String(form.get("personId") ?? "").trim();
  const intent = String(form.get("intent") ?? "toggle");
  const note = typeof form.get("note") === "string" ? String(form.get("note")) : null;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(personId) || !["save", "unsave", "toggle"].includes(intent)) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const saved = await setSaved(user, personId, intent === "toggle" ? undefined : intent === "save", note);
  if (saved === null) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, personId, saved });
}
