/**
 * The assistant conversation (AI SDK useChat over the shared Chat from
 * AssistantProvider): an empty state with example questions and a scripted
 * walkthrough, the messages, and the question box. Used by the side panel
 * and the full page.
 */
import { useChat } from "@ai-sdk/react";
import { CirclePlay, RotateCcw, SendHorizontal, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouteLoaderData } from "react-router";
import type { Chat } from "@ai-sdk/react";
import { VillageMark } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { useT } from "~/i18n";
import { cn } from "~/lib/utils";
import { useAssistant } from "./assistant-provider";
import type { AskMessage } from "./chat-types";
import { ExamplePrompts } from "./example-prompts";
import { buildExampleChat } from "./example-chat";
import { AskMessageView } from "./message-view";
import { MAX_MESSAGE_CHARS } from "./types";

type Variant = "panel" | "page";

export function AssistantConversation({ variant }: { variant: Variant }) {
  const { chat } = useAssistant();
  // A new key per chat so switching chats starts from a clean view.
  return <ChatView key={chat.id} chat={chat} variant={variant} />;
}

function ChatView({ chat, variant }: { chat: Chat<AskMessage>; variant: Variant }) {
  const { t } = useT();
  const root = useRouteLoaderData("root") as { aiConfigured?: boolean } | undefined;
  const { messages, sendMessage, status, error, stop, regenerate } = useChat<AskMessage>({ chat });
  const page = variant === "page";
  const [draft, setDraft] = useState("");
  const [example, setExample] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const tooLong = draft.length > MAX_MESSAGE_CHARS;

  const send = (text: string) => {
    const content = text.trim();
    if (!content || busy || content.length > MAX_MESSAGE_CHARS) return;
    setExample(false);
    setDraft("");
    void sendMessage({ text: content });
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, status]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(draft);
    }
  }

  const last = messages[messages.length - 1];
  // Our server sends translated error text; anything else (a dropped connection) gets the general message.
  const errorText = error && error.message && error.message.length < 240 && !error.message.startsWith("{") ? error.message : t("assistant.errorGeneric");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", page ? "py-2" : "px-4 py-4")}>
        {messages.length === 0 ? (
          example ? (
            <ExampleConversation
              onDone={() => {
                setExample(false);
                inputRef.current?.focus();
              }}
            />
          ) : (
            <div className={cn("flex flex-col gap-4 py-2", page ? "my-auto items-center text-center" : "items-start")}>
              <VillageMark className="size-10" />
              <div className="space-y-1">
                <h2 className="text-section">{t("assistant.emptyTitle")}</h2>
                <p className="text-sm text-smoke">{t("assistant.emptyBody")}</p>
              </div>
              <ExamplePrompts onPick={send} label={t("dashboard.examplesLabel")} className={cn(page && "max-w-2xl justify-center")} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setExample(true)} className={cn(!page && "-ml-2")}>
                <CirclePlay aria-hidden="true" />
                {t("assistant.exampleButton")}
              </Button>
            </div>
          )
        ) : (
          <ol role="log" aria-live="polite" aria-label={t("assistant.conversationLabel")} className="grid gap-5">
            {messages.map((message) => (
              <li key={message.id}>
                <AskMessageView message={message} busy={busy && message === last} />
              </li>
            ))}
            {status === "submitted" && last?.role === "user" && (
              <li role="status" className="flex items-center gap-3 text-sm text-smoke">
                <VillageMark className="size-6" />
                <span className="flex gap-1" aria-hidden="true">
                  <span className="size-2 animate-bounce rounded-full bg-gold [animation-delay:-0.3s]" />
                  <span className="size-2 animate-bounce rounded-full bg-gold/70 [animation-delay:-0.15s]" />
                  <span className="size-2 animate-bounce rounded-full bg-gold/40" />
                </span>
                {t("assistant.pending")}
              </li>
            )}
          </ol>
        )}
        {error && !busy && (
          <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-rust-soft px-4 py-3 text-sm text-rust-ink">
            <span className="flex-1">{errorText}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void regenerate()}>
              <RotateCcw aria-hidden="true" />
              {t("assistant.retry")}
            </Button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
        className={cn("shrink-0", page ? "mt-3 rounded-card bg-taupe p-3" : "border-t border-stone bg-canvas p-3")}
      >
        <label htmlFor={`ask-${variant}`} className="sr-only">
          {t("assistant.inputLabel")}
        </label>
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            id={`ask-${variant}`}
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("assistant.placeholder")}
            aria-invalid={tooLong || undefined}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border-stone bg-canvas px-4 py-2.5"
          />
          {busy ? (
            <Button type="button" variant="outline" size="icon-lg" className="size-11 shrink-0" onClick={() => void stop()} aria-label={t("assistant.stop")}>
              <Square aria-hidden="true" />
            </Button>
          ) : (
            <Button type="submit" variant="brand" size="icon-lg" className="size-11 shrink-0" disabled={!draft.trim() || tooLong} aria-label={t("assistant.send")}>
              <SendHorizontal aria-hidden="true" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-xs text-smoke">
          {tooLong ? (
            t("assistant.errorTooLong")
          ) : (
            <>
              {t("assistant.enterHint")}
              {root?.aiConfigured === false && <span className="block sm:inline sm:before:content-['_']">{t("common.ai.notConfigured")}</span>}
            </>
          )}
        </p>
      </form>
    </div>
  );
}

/** Plays the scripted example once, then hands back to a real question. */
function ExampleConversation({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const script = useMemo(() => buildExampleChat(t), [t]);
  const transport = useMemo(() => script.transport(), [script]);
  const { messages, sendMessage, status } = useChat<AskMessage>({ messages: script.get(0), transport });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const next = script.next([]);
    if (next) void sendMessage(next);
  }, [script, sendMessage]);

  const done = status === "ready" && messages.length > 1;
  const last = messages[messages.length - 1];
  return (
    <div className="grid gap-5">
      <ol className="grid gap-5" aria-live="polite">
        {messages.map((message) => (
          <li key={message.id}>
            <AskMessageView message={message} busy={!done && message === last} />
          </li>
        ))}
      </ol>
      {done && (
        <div className="grid gap-3 rounded-2xl bg-gold-soft/60 p-4 text-sm text-graphite">
          <p>{t("assistant.exampleDone")}</p>
          <Button type="button" variant="brand" size="sm" onClick={onDone} className="justify-self-start">
            {t("assistant.exampleTryIt")}
          </Button>
        </div>
      )}
    </div>
  );
}
