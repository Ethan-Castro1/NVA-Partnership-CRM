/**
 * "Ask the village": a chat with the assistant. The conversation lives only in
 * this page's state; each turn posts the visible history (as JSON in a hidden
 * field) plus the new message, and gets back an answer and the people in it.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { data, useFetcher, useLoaderData, useNavigate, useRouteLoaderData } from "react-router";
import { RotateCcw, SendHorizontal } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/app.ask";
import { ExamplePrompts } from "~/components/assistant/example-prompts";
import { PersonCard } from "~/components/assistant/person-card";
import { RichAnswer } from "~/components/assistant/rich-answer";
import { MAX_MESSAGE_CHARS, MAX_TURNS, type AssistantPerson, type ChatTurn } from "~/components/assistant/types";
import { AiNotice, Field, PageHeader, Sheet, VillageMark } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { makeT, useT, type MessageKey } from "~/i18n";
import { getLocale } from "~/i18n/locale.server";
import { peopleForCards, runAssistant } from "~/lib/ai/assistant.server";
import { requireUser } from "~/lib/auth.server";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("assistant.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
  return { q };
}

/** Earlier turns, as sent by the page. The new message comes separately. */
const historySchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
    }),
  )
  .max(MAX_TURNS - 1);

type ActionResult =
  | { ok: true; answer: string; people: AssistantPerson[]; mode: "ai" | "fallback" }
  | { ok: false; error: MessageKey };

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const fail = (error: MessageKey, status: number) => data<ActionResult>({ ok: false, error }, { status });

  const message = String(form.get("message") ?? "").trim();
  if (!message) return fail("assistant.errorEmpty", 400);
  if (message.length > MAX_MESSAGE_CHARS) return fail("assistant.errorTooLong", 400);

  let history: ChatTurn[];
  try {
    history = historySchema.parse(JSON.parse(String(form.get("history") ?? "[]")));
  } catch {
    return fail("assistant.errorInvalid", 400);
  }

  const locale = await getLocale(request, user.locale);
  try {
    const result = await runAssistant({ messages: [...history, { role: "user", content: message }], locale, user });
    if (!result.ok) return fail(result.error, 503);
    const people = await peopleForCards(result.personIds);
    return data<ActionResult>({ ok: true, answer: result.answer, people, mode: result.mode });
  } catch {
    return fail("assistant.errorGeneric", 500);
  }
}

type UiMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  people?: AssistantPerson[];
  mode?: "ai" | "fallback";
};

export default function Ask() {
  const { q } = useLoaderData<typeof loader>();
  const root = useRouteLoaderData("root") as { aiConfigured?: boolean } | undefined;
  const { t } = useT();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionResult>();

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const pending = fetcher.state !== "idle";

  const nextId = useRef(1);
  // Bumped by "New conversation" so a late answer to the old one is ignored.
  const conversation = useRef(0);
  const askedIn = useRef(0);
  const handled = useRef<unknown>(null);
  const autoAsked = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /** Sends `text` after the turns in `base` (the history the server sees). */
  function sendAfter(base: UiMessage[], text: string) {
    const content = text.trim();
    if (!content || pending) return;
    if (content.length > MAX_MESSAGE_CHARS) {
      setError("assistant.errorTooLong");
      return;
    }
    const history: ChatTurn[] = base
      .slice(-(MAX_TURNS - 1))
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
    while (history[0]?.role === "assistant") history.shift();

    setMessages([...base, { id: nextId.current++, role: "user", content }]);
    setError(null);
    setDraft("");
    askedIn.current = conversation.current;
    fetcher.submit({ message: content, history: JSON.stringify(history) }, { method: "post" });
  }

  const send = (text: string) => sendAfter(messages, text);

  function retry() {
    const last = messages[messages.length - 1];
    if (last?.role === "user") sendAfter(messages.slice(0, -1), last.content);
  }

  function newConversation() {
    conversation.current += 1;
    setMessages([]);
    setDraft("");
    setError(null);
    if (q) navigate("/app/ask", { replace: true });
    inputRef.current?.focus();
  }

  // Ask ?q= once when arriving from the dashboard.
  useEffect(() => {
    if (q && autoAsked.current !== q) {
      autoAsked.current = q;
      sendAfter([], q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Take each answer once.
  useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || handled.current === result) return;
    handled.current = result;
    if (askedIn.current !== conversation.current) return;
    if (result.ok) {
      setMessages((prev) => [
        ...prev,
        { id: nextId.current++, role: "assistant", content: result.answer, people: result.people, mode: result.mode },
      ]);
    } else {
      setError(result.error);
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, pending]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(draft);
    }
  }

  const lastIsUnanswered = messages[messages.length - 1]?.role === "user";

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader
        eyebrow={t("assistant.eyebrow")}
        title={t("assistant.title")}
        description={t("assistant.description")}
        actions={
          messages.length > 0 && (
            <Button type="button" variant="outline" onClick={newConversation}>
              <RotateCcw aria-hidden="true" />
              {t("assistant.newConversation")}
            </Button>
          )
        }
      />

      {root?.aiConfigured === false && <AiNotice />}

      <section aria-label={t("assistant.conversationLabel")} className="grid gap-5">
        {messages.length === 0 && !pending && !q ? (
          <Sheet className="flex flex-col items-start gap-4 p-6 md:p-8">
            <VillageMark className="size-10" />
            <div className="space-y-1">
              <h2 className="text-section">{t("assistant.emptyTitle")}</h2>
              <p className="text-sm text-smoke">{t("assistant.emptyBody")}</p>
            </div>
            <ExamplePrompts onPick={send} label={t("dashboard.examplesLabel")} />
          </Sheet>
        ) : (
          <ol role="log" aria-live="polite" aria-relevant="additions" className="grid gap-5">
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-3 text-[0.95rem] whitespace-pre-wrap text-white">
                    <span className="sr-only">{t("assistant.you")}: </span>
                    {m.content}
                  </div>
                </li>
              ) : (
                <li key={m.id}>
                  <Sheet className="grid gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <VillageMark className="size-6" />
                      <span className="text-sm font-medium text-ink">{t("assistant.assistantName")}</span>
                      {m.mode === "fallback" && (
                        <span className="rounded-full bg-taupe px-2.5 py-0.5 text-xs text-smoke">{t("assistant.fallbackNotice")}</span>
                      )}
                    </div>
                    <RichAnswer text={m.content} />
                    {m.people && m.people.length > 0 && (
                      <div className="grid gap-3 border-t border-stone pt-4">
                        <h2 className="text-eyebrow text-smoke">{t("assistant.peopleMentioned")}</h2>
                        <ul className="grid gap-3 sm:grid-cols-2">
                          {m.people.map((p) => (
                            <li key={p.id}>
                              <PersonCard person={p} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Sheet>
                </li>
              ),
            )}
          </ol>
        )}

        {pending && (
          <p role="status" className="flex items-center gap-3 text-sm text-smoke">
            <span className="flex gap-1" aria-hidden="true">
              <span className="size-2 animate-bounce rounded-full bg-gold [animation-delay:-0.3s]" />
              <span className="size-2 animate-bounce rounded-full bg-rust [animation-delay:-0.15s]" />
              <span className="size-2 animate-bounce rounded-full bg-blue" />
            </span>
            {t("assistant.pending")}
          </p>
        )}

        {error && !pending && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-rust-soft px-4 py-3 text-sm text-rust-ink">
            <span className="flex-1">{t(error)}</span>
            {lastIsUnanswered && (
              <Button type="button" size="sm" variant="outline" onClick={retry}>
                {t("assistant.retry")}
              </Button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </section>

      <fetcher.Form
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
        className="rounded-card bg-taupe p-4 md:p-5"
      >
        <input
          type="hidden"
          name="history"
          value={JSON.stringify(messages.slice(-(MAX_TURNS - 1)).map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) })))}
        />
        <Field label={t("assistant.inputLabel")} htmlFor="ask-message" hint={t("assistant.enterHint")}>
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              id="ask-message"
              name="message"
              rows={2}
              maxLength={MAX_MESSAGE_CHARS}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t("assistant.placeholder")}
              className="max-h-48 min-h-12 flex-1 resize-none rounded-2xl border-stone bg-canvas px-4 py-3"
            />
            <Button
              type="submit"
              variant="brand"
              size="lg"
              disabled={pending || !draft.trim()}
              className={cn("shrink-0", pending && "cursor-wait")}
            >
              <SendHorizontal aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t("assistant.send")}</span>
            </Button>
          </div>
        </Field>
      </fetcher.Form>
    </div>
  );
}
