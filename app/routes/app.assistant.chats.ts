/**
 * GET /app/assistant/chats: the signed-in staff member's saved chats.
 * POST with intent=delete and id removes one of them.
 */
import type { Route } from "./+types/app.assistant.chats";
import { deleteChat, listChats } from "~/lib/ai/assistant-chats.server";
import { requireUser } from "~/lib/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return Response.json({ chats: await listChats(user.id) });
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  if (form.get("intent") === "delete" && /^[A-Za-z0-9_-]{1,100}$/.test(id)) await deleteChat(user.id, id);
  return Response.json({ ok: true });
}
