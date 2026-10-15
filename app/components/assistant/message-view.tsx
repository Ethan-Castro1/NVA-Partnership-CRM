/**
 * One chat message, drawn the same way in the side panel, the full page and
 * the scripted example: what was looked up (one plain line per step), the
 * answer, then cards for the people in it.
 */
import type { DynamicToolUIPart } from "ai";
import { Check, CircleAlert, FolderKanban, Globe, Loader2, Route, Search, UserRound, Users } from "lucide-react";
import type { ReactNode } from "react";
import { VillageMark } from "~/components/nva";
import { useT, type MessageKey } from "~/i18n";
import { cn } from "~/lib/utils";
import type { AskMessage, StepOutput } from "./chat-types";
import { PersonCard } from "./person-card";
import { RichAnswer } from "./rich-answer";

const STEP_ICON: Record<string, ReactNode> = {
  search_people: <Search />,
  find_connectors_for_need: <Users />,
  get_person: <UserRound />,
  find_intro_paths: <Route />,
  list_caps: <FolderKanban />,
  search_web: <Globe />,
};

function stepLabel(part: DynamicToolUIPart, t: (key: MessageKey, vars?: Record<string, string | number>) => string): string {
  const input = (part.input ?? {}) as { query?: unknown };
  const q = typeof input.query === "string" ? input.query.trim().slice(0, 60) : "";
  switch (part.toolName) {
    case "search_people":
      return q ? t("assistant.step.search_people", { q }) : t("assistant.step.search_people_all");
    case "find_connectors_for_need":
    case "search_web":
      return t(`assistant.step.${part.toolName}`, { q });
    case "get_person":
    case "find_intro_paths":
    case "list_caps":
      return t(`assistant.step.${part.toolName}`);
    default:
      return t("assistant.step.other");
  }
}

function Step({ part }: { part: DynamicToolUIPart }) {
  const { t } = useT();
  const working = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error";
  const found = part.state === "output-available" ? ((part.output as StepOutput | undefined)?.found ?? 0) : 0;
  const status = working
    ? t("assistant.step.working")
    : failed
      ? t("assistant.step.failed")
      : found
        ? t("assistant.step.found", { count: found })
        : t("assistant.step.none");
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full [&_svg]:size-3.5",
          failed ? "bg-rust-soft text-rust-ink" : "bg-gold-soft text-gold-ink",
        )}
        aria-hidden="true"
      >
        {STEP_ICON[part.toolName] ?? <Search />}
      </span>
      <span className="min-w-0 flex-1 truncate text-graphite">{stepLabel(part, t)}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-smoke">
        {working ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : failed ? (
          <CircleAlert className="size-3.5 text-rust-ink" aria-hidden="true" />
        ) : (
          <Check className="size-3.5 text-sage-ink" aria-hidden="true" />
        )}
        {status}
      </span>
    </li>
  );
}

export function AskMessageView({ message, busy = false }: { message: AskMessage; busy?: boolean }) {
  const { t } = useT();

  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[0.95rem] whitespace-pre-wrap text-white">
          <span className="sr-only">{t("assistant.you")}: </span>
          {text}
        </div>
      </div>
    );
  }

  const steps = message.parts.filter((p): p is DynamicToolUIPart => p.type === "dynamic-tool");
  const text = message.parts
    .map((p) => (p.type === "text" ? p.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
  const people = message.parts.flatMap((p) => (p.type === "data-people" ? [p.data] : []))[0];
  const notice = message.parts.flatMap((p) => (p.type === "data-notice" ? [p.data.kind] : []))[0];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <VillageMark className="size-6" />
        <span className="text-sm font-medium text-ink">{t("assistant.assistantName")}</span>
        {notice === "fallback" && <span className="rounded-full bg-taupe px-2.5 py-0.5 text-xs text-smoke">{t("assistant.fallbackNotice")}</span>}
        {notice === "example" && (
          <span className="rounded-full bg-gold-soft px-2.5 py-0.5 text-xs font-medium text-gold-ink">{t("assistant.exampleBadge")}</span>
        )}
      </div>

      {steps.length > 0 && (
        <section aria-label={t("assistant.stepsLabel")} className="rounded-2xl border border-stone bg-canvas px-3.5 py-3">
          <ol className="grid gap-2">
            {steps.map((part) => (
              <Step key={part.toolCallId} part={part} />
            ))}
          </ol>
        </section>
      )}

      {text ? (
        <RichAnswer text={text} />
      ) : (
        busy &&
        !steps.length && (
          <p role="status" className="flex items-center gap-3 text-sm text-smoke">
            <span className="flex gap-1" aria-hidden="true">
              <span className="size-2 animate-bounce rounded-full bg-gold [animation-delay:-0.3s]" />
              <span className="size-2 animate-bounce rounded-full bg-gold/70 [animation-delay:-0.15s]" />
              <span className="size-2 animate-bounce rounded-full bg-gold/40" />
            </span>
            {t("assistant.pending")}
          </p>
        )
      )}

      {people && people.people.length > 0 && (
        <div className="@container grid gap-2 border-t border-stone pt-3">
          <h3 className="text-eyebrow text-smoke">{t("assistant.peopleMentioned")}</h3>
          <ul className="grid gap-2.5 @lg:grid-cols-2">
            {people.people.map((p) => (
              <li key={p.id}>
                <PersonCard person={p} example={people.example} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
