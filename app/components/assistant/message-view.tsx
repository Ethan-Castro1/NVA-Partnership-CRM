/**
 * One chat message, drawn the same way in the side panel, the full page and
 * the scripted example, with shadcn's Message and Bubble: the question as a
 * bubble on the right; the answer on the left with what was looked up (one
 * quiet line), the answer itself, Copy / Regenerate, and cards for the people in it.
 */
import type { DynamicToolUIPart } from "ai";
import {
  Briefcase,
  CalendarCheck,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  FolderKanban,
  Globe,
  Loader2,
  RefreshCw,
  Route,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { VillageMark } from "~/components/nva";
import { Bubble, BubbleContent } from "~/components/ui/bubble";
import { Button } from "~/components/ui/button";
import { Message, MessageContent, MessageFooter } from "~/components/ui/message";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useT, type MessageKey } from "~/i18n";
import { cn } from "~/lib/utils";
import type { AskMessage, StepOutput } from "./chat-types";
import { PersonRow } from "./person-card";
import { RichAnswer } from "./rich-answer";

const STEP_ICON: Record<string, ReactNode> = {
  search_people: <Search />,
  find_connectors_for_need: <Users />,
  get_person: <UserRound />,
  find_intro_paths: <Route />,
  list_caps: <FolderKanban />,
  search_web: <Globe />,
  list_follow_ups: <CalendarCheck />,
  list_opportunities: <Briefcase />,
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
    case "list_follow_ups":
    case "list_opportunities":
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
    <li className="flex items-center gap-2 text-xs">
      <span className={cn("grid shrink-0 place-items-center [&_svg]:size-3.5", failed ? "text-rust-ink" : "text-gold-ink")} aria-hidden="true">
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

/** All lookups as one quiet line ("Looked in 2 places"); open it to see each step and what it found. */
function Steps({ steps }: { steps: DynamicToolUIPart[] }) {
  const { t } = useT();
  const working = steps.find((p) => p.state === "input-streaming" || p.state === "input-available");
  return (
    <details className="group text-sm">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-full text-xs text-smoke hover:text-graphite [&::-webkit-details-marker]:hidden">
        {working ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Search className="size-3.5" aria-hidden="true" />}
        <span>
          {working
            ? t("assistant.stepsWorking", { step: stepLabel(working, t) })
            : steps.length === 1
              ? t("assistant.stepsSummaryOne")
              : t("assistant.stepsSummary", { count: steps.length })}
        </span>
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ol className="mt-2 grid gap-1.5 border-l-2 border-gold-soft pl-3">
        {steps.map((part) => (
          <Step key={part.toolCallId} part={part} />
        ))}
      </ol>
    </details>
  );
}

/** The answer as plain text, for the clipboard: link labels without their addresses, no bold markers. */
export function plainAnswer(text: string): string {
  return text.replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "$1").replace(/\*\*/g, "");
}

/** A small icon action under an answer, with its name as a tooltip. */
function MessageAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClick} aria-label={label} className="text-smoke hover:text-ink max-md:size-10">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CopyAnswer({ text }: { text: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <MessageAction
      label={copied ? t("common.action.copied") : t("common.action.copy")}
      onClick={() => void navigator.clipboard?.writeText(plainAnswer(text)).then(() => setCopied(true))}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </MessageAction>
  );
}

export function AskMessageView({
  message,
  busy = false,
  onRegenerate,
}: {
  message: AskMessage;
  busy?: boolean;
  /** Only on the latest answer: ask the same question again. */
  onRegenerate?: () => void;
}) {
  const { t } = useT();

  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end" variant="muted" className="max-w-[85%]">
            <BubbleContent className="rounded-3xl bg-taupe px-4 py-2.5 text-[0.95rem] whitespace-pre-wrap text-ink">
              <span className="sr-only">{t("assistant.you")}: </span>
              {text}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }

  const steps = message.parts.filter((p): p is DynamicToolUIPart => p.type === "dynamic-tool");
  const text = message.parts
    .map((p) => (p.type === "text" ? p.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
  const people = message.parts.flatMap((p) => (p.type === "data-people" ? [p.data] : []))[0];
  const notice = message.parts.flatMap((p) => (p.type === "data-notice" ? [p.data.kind] : []))[0];

  const showActions = !!text && !busy && notice !== "example";
  return (
    <Message className="gap-3">
      <VillageMark className="mt-0.5 size-7 shrink-0" />
      <MessageContent className="min-w-0 flex-1 gap-2.5">
        <span className="sr-only">{t("assistant.assistantName")}</span>
        {notice && (
          <span
            className={cn(
              "w-fit rounded-full px-2.5 py-0.5 text-xs",
              notice === "example" ? "bg-gold-soft font-medium text-gold-ink" : "bg-taupe text-smoke",
            )}
          >
            {notice === "example" ? t("assistant.exampleBadge") : t("assistant.fallbackNotice")}
          </span>
        )}
        {steps.length > 0 && <Steps steps={steps} />}
        {text ? (
          <RichAnswer text={text} className="text-[0.95rem]" />
        ) : (
          busy &&
          !steps.length && (
            <p className="flex items-center gap-2 text-sm text-smoke">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {t("assistant.pending")}
            </p>
          )
        )}
        {people && people.people.length > 0 && (
          <ul aria-label={t("assistant.peopleMentioned")} className="grid gap-1.5">
            {people.people.map((p) => (
              <li key={p.id}>
                <PersonRow person={p} example={people.example} />
              </li>
            ))}
          </ul>
        )}
        {showActions && (
          <MessageFooter className="-ml-2 gap-0.5 px-0">
            <CopyAnswer text={text} />
            {onRegenerate && (
              <MessageAction label={t("assistant.regenerate")} onClick={onRegenerate}>
                <RefreshCw aria-hidden="true" />
              </MessageAction>
            )}
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}
