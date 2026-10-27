/** GET /app/assistant/chats/:chatId: one saved chat (only its owner can read it), with fresh person cards. */
import type { Route } from "./+types/app.assistant.chats.$chatId";
import { getChat, refreshChatCards } from "~/lib/ai/assistant-chats.server";
import { requireUser } from "~/lib/auth.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const chat = await getChat(user.id, params.chatId);
  if (!chat) return new Response(null, { status: 404 });
  // Cards are rebuilt for who is asking now, so a saved chat never shows someone since hidden.
  return Response.json({ chat: { ...chat, messages: await refreshChatCards(chat.messages, user) } });
}
