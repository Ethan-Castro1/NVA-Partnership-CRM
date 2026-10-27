/**
 * POST /app/assistant/chat: the assistant's streaming endpoint for AI SDK
 * useChat. Text streams as it is written, each database or web lookup shows
 * up as a step, and the people in the answer arrive as cards at the end.
 * The whole conversation is saved for the staff member when the answer ends.
 */
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { z } from "zod";
import type { Route } from "./+types/app.assistant.chat";
import { messageText, type AskMessage } from "~/components/assistant/chat-types";
import { MAX_MESSAGE_CHARS, MAX_TURNS, type ChatTurn } from "~/components/assistant/types";
import { makeT } from "~/i18n";
import { getLocale } from "~/i18n/locale.server";
import { chatOwner, saveChat } from "~/lib/ai/assistant-chats.server";
import { peopleForCards, runAssistant } from "~/lib/ai/assistant.server";
import { requireUser } from "~/lib/auth.server";

/** A whole conversation as JSON stays well under this. */
const MAX_BODY_BYTES = 600_000;
/** Earlier answers are trimmed to this when sent back to the model. */
const HISTORY_CHARS = 6000;

const bodySchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  messages: z
    .array(
      z.looseObject({
        id: z.string().max(200),
        role: z.enum(["user", "assistant"]),
        parts: z.array(z.looseObject({ type: z.string() })).max(300),
      }),
    )
    .min(1)
    .max(MAX_TURNS * 2),
});

const fail = (status: number) => new Response(null, { status });

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  if (request.method !== "POST") return fail(405);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail(413);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(JSON.parse(raw));
  } catch {
    return fail(400);
  }
  const owner = await chatOwner(body.id);
  if (owner && owner !== user.id) return fail(404);

  const messages = body.messages as unknown as AskMessage[];
  const last = messages[messages.length - 1];
  const question = messageText(last);
  if (last.role !== "user" || !question || question.length > MAX_MESSAGE_CHARS) return fail(400);

  const turns: ChatTurn[] = messages
    .map((m) => ({ role: m.role as ChatTurn["role"], content: messageText(m).slice(0, HISTORY_CHARS) }))
    .filter((turn) => turn.content)
    .slice(-MAX_TURNS);

  const locale = await getLocale(request, user.locale);
  const t = makeT(locale);

  const stream = createUIMessageStream<AskMessage>({
    originalMessages: messages,
    onError: () => t("assistant.errorGeneric"),
    execute: async ({ writer }) => {
      let streamed = false;
      const result = await runAssistant({
        messages: turns,
        locale,
        user,
        events: {
          textStart: (id) => {
            streamed = true;
            writer.write({ type: "text-start", id });
          },
          textDelta: (id, delta) => writer.write({ type: "text-delta", id, delta }),
          textEnd: (id) => writer.write({ type: "text-end", id }),
          toolStart: (step) =>
            writer.write({ type: "tool-input-available", toolCallId: step.id, toolName: step.name, input: step.input, dynamic: true }),
          toolEnd: (step, outcome) =>
            outcome.isError
              ? writer.write({ type: "tool-output-error", toolCallId: step.id, errorText: "failed", dynamic: true })
              : writer.write({ type: "tool-output-available", toolCallId: step.id, output: { found: outcome.found }, dynamic: true }),
        },
      });

      if (!result.ok) {
        writer.write({ type: "error", errorText: t(result.error) });
        return;
      }
      if (result.mode === "fallback") writer.write({ type: "data-notice", data: { kind: "fallback" } });
      // Plain-search answers, refusals and "too many steps" were never streamed: send them whole.
      if (!streamed) {
        writer.write({ type: "text-start", id: "answer" });
        writer.write({ type: "text-delta", id: "answer", delta: result.answer });
        writer.write({ type: "text-end", id: "answer" });
      }
      const people = await peopleForCards(result.personIds, user);
      if (people.length) writer.write({ type: "data-people", data: { people } });
    },
    onEnd: async ({ messages: all }) => {
      try {
        await saveChat(user.id, body.id, all);
      } catch {
        console.error("assistant: could not save a chat");
      }
    },
  });
  return createUIMessageStreamResponse({ stream });
}
