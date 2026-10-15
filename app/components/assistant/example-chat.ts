/**
 * A scripted example conversation (no model, no network) built with
 * @shadcn/helpers. "Watch an example" streams it through the same useChat
 * and message view as a real answer, so people see how the assistant works
 * before they ask. The people in it are made up and their cards don't link.
 */
import { createChat } from "@shadcn/helpers/ai-sdk";
import type { MessageKey } from "~/i18n";
import type { AskMessage } from "./chat-types";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function buildExampleChat(t: Translate) {
  return createChat<AskMessage>({ messageIdPrefix: "example" })
    .user(t("assistant.exampleQuestion"))
    .sleep(400)
    .assistant(({ writer }) => {
      writer.data({ type: "data-notice", data: { kind: "example" } });
      writer
        .tool("find_connectors_for_need", { dynamic: true, input: { query: "sewing" } })
        .sleep(900)
        .output({ found: 2 });
      writer
        .tool("find_intro_paths", { dynamic: true, input: { person_id: "example-lucia" } })
        .sleep(700)
        .output({ found: 1 });
      writer.text(t("assistant.exampleAnswer"), { delayMs: 25 });
      writer.data({
        type: "data-people",
        data: {
          example: true,
          people: [
            {
              id: "example-lucia",
              full_name: "Lucía Herrera",
              title: t("assistant.exampleRole"),
              organization_name: t("assistant.exampleOrg"),
              contribution_types: ["skills_lesson", "classroom_volunteer"],
              status: "active",
              skills: ["sewing", "tailoring", "pattern making"],
            },
          ],
        },
      });
    });
}
