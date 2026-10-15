/**
 * The assistant chat's message shape (AI SDK UIMessage), shared by the
 * streaming route, the saved-chat store and the chat components.
 *
 * Tool calls arrive as `dynamic-tool` parts (toolName, input, and an output of
 * { found }), shown as plain-language steps. Two data parts ride along:
 * `data-people` (cards for the people in the answer) and `data-notice`
 * (the plain-search fallback, or a scripted example).
 */
import type { UIMessage } from "ai";
import type { AssistantPerson } from "./types";

export type AskData = {
  people: { people: AssistantPerson[]; example?: boolean };
  notice: { kind: "fallback" | "example" };
};

export type AskMessage = UIMessage<unknown, AskData>;

/** What a lookup step reports back to the page. */
export type StepOutput = { found: number };

/** One saved chat in the history list. */
export type ChatSummary = { id: string; title: string; updated_at: string };

/** The text of a message, for titles and for the model's history. */
export function messageText(message: Pick<AskMessage, "parts">): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
