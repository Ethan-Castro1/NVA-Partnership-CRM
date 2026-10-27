/**
 * A scripted example conversation (no model, no network) built with
 * @shadcn/helpers. "Watch an example" streams it through the same useChat
 * and message view as a real answer, so people see how the assistant works
 * before they ask. The person in it is made up (not in the demo data), the
 * answer says nothing their card doesn't show, and the card doesn't link.
 */
import { createChat } from "@shadcn/helpers/ai-sdk";
import type { MessageKey } from "~/i18n";
import type { AskMessage } from "./chat-types";

/** A made-up name that isn't in the demo data. */
const EXAMPLE_NAME = "Paloma Quintero";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function buildExampleChat(t: Translate) {
  const skills = t("assistant.exampleSkills").split(", ");
  return createChat<AskMessage>({ messageIdPrefix: "example" })
    .user(t("assistant.exampleQuestion"))
    .sleep(400)
    .assistant(({ writer }) => {
      writer.data({ type: "data-notice", data: { kind: "example" } });
      writer
        .tool("find_connectors_for_need", { dynamic: true, input: { query: skills[0] } })
        .sleep(900)
        .output({ found: 1 });
      writer.text(t("assistant.exampleAnswer"), { delayMs: 25 });
      writer.data({
        type: "data-people",
        data: {
          example: true,
          people: [
            {
              id: "example-person",
              full_name: EXAMPLE_NAME,
              title: t("assistant.exampleRole"),
              organization_name: t("assistant.exampleOrg"),
              contribution_types: ["skills_lesson"],
              status: "active",
              skills,
              reasons: [{ kind: "skill", value: skills[0] }],
            },
          ],
        },
      });
    });
}
