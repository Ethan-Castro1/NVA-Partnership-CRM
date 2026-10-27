/**
 * Saved assistant chats. Each staff member sees only their own. A chat is
 * created the first time its id is used and replaced as a whole on every
 * answer (the AI SDK sends the full conversation each turn).
 */
import { messageText, type AskMessage, type ChatSummary } from "~/components/assistant/chat-types";
import { query, queryOne } from "~/lib/db.server";
import type { Viewer } from "~/lib/permissions.server";
import { peopleForCards } from "./assistant.server";

/** How many chats the history list shows. */
export const CHAT_LIST_LIMIT = 50;
const TITLE_MAX = 80;

export function chatTitle(messages: AskMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = first ? messageText(first).replace(/\s+/g, " ") : "";
  if (!text) return "…";
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1).trimEnd()}…` : text;
}

export async function listChats(userId: string): Promise<ChatSummary[]> {
  return query<ChatSummary>(
    `SELECT id, title, updated_at FROM assistant_chats WHERE user_id = $1 ORDER BY updated_at DESC LIMIT ${CHAT_LIST_LIMIT}`,
    [userId],
  );
}

export async function getChat(userId: string, id: string): Promise<{ id: string; title: string; messages: AskMessage[] } | null> {
  return queryOne(`SELECT id, title, messages FROM assistant_chats WHERE id = $1 AND user_id = $2`, [id, userId]);
}

/** Who owns a chat id, if anyone yet. */
export async function chatOwner(id: string): Promise<string | null> {
  return (await queryOne<{ user_id: string }>("SELECT user_id FROM assistant_chats WHERE id = $1", [id]))?.user_id ?? null;
}

export async function saveChat(userId: string, id: string, messages: AskMessage[]): Promise<void> {
  // The WHERE keeps someone else's chat untouched even if an id is reused.
  await query(
    `INSERT INTO assistant_chats (id, user_id, title, messages) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET messages = EXCLUDED.messages, updated_at = now()
       WHERE assistant_chats.user_id = EXCLUDED.user_id`,
    [id, userId, chatTitle(messages), JSON.stringify(messages)],
  );
}

export async function deleteChat(userId: string, id: string): Promise<void> {
  await query("DELETE FROM assistant_chats WHERE id = $1 AND user_id = $2", [id, userId]);
}

/**
 * A saved chat's person cards, rebuilt for the viewer as they are now: people
 * since hidden from them drop out, and contact details and the Contact or
 * Request Introduction choice follow each person's current settings.
 */
export async function refreshChatCards(messages: AskMessage[], viewer: Viewer): Promise<AskMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      if (!message.parts.some((p) => p.type === "data-people" && !p.data.example)) return message;
      const parts = await Promise.all(
        message.parts.map(async (part) => {
          if (part.type !== "data-people" || part.data.example) return part;
          const old = part.data.people;
          const reasons = Object.fromEntries(old.map((p) => [p.id, p.reasons ?? []]));
          const people = await peopleForCards(
            old.map((p) => p.id),
            viewer,
            reasons,
          );
          return { ...part, data: { ...part.data, people } };
        }),
      );
      return { ...message, parts };
    }),
  );
}
