/**
 * The assistant conversation (AI SDK useChat over the shared Chat from
 * AssistantProvider), built with shadcn's AI Elements parts: Message Scroller
 * (follows new text, "jump to latest"), Message and Bubble, and the Prompt
 * Input. On the full page an empty chat is a centered greeting with the
 * question box and suggestions, like other chat apps; once it starts, the box
 * docks at the bottom. Used by the side panel and the full page.
 */
import { Chat, useChat } from "@ai-sdk/react";
import { CirclePlay, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouteLoaderData } from "react-router";
import { VillageMark } from "~/components/nva";
import { Button } from "~/components/ui/button";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "~/components/ui/message-scroller";
import { useT } from "~/i18n";
import { cn } from "~/lib/utils";
import { useAssistant } from "./assistant-provider";
import type { AskMessage } from "./chat-types";
import { ExamplePrompts } from "./example-prompts";
import { buildExampleChat } from "./example-chat";
import { AskMessageView } from "./message-view";
import { PromptInput } from "./prompt-input";
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
  const [stopped, setStopped] = useState(false);
  const [announce, setAnnounce] = useState("");
  const wasBusy = useRef(false);
  const stoppedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";

  const send = (text: string) => {
    const content = text.trim();
    if (!content || busy || content.length > MAX_MESSAGE_CHARS) return;
    setExample(false);
    setDraft("");
    setStopped(false);
    stoppedRef.current = false;
    void sendMessage({ text: content });
  };

  const onStop = () => {
    setStopped(true);
    stoppedRef.current = true;
    void stop();
  };

  // Screen readers hear "Answer ready" once when an answer finishes, not every word as it streams.
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      setAnnounce("");
    } else if (wasBusy.current) {
      wasBusy.current = false;
      setAnnounce(stoppedRef.current ? t("assistant.stopped") : status === "error" ? "" : t("assistant.answerReady"));
    }
  }, [busy, status, t]);

  // Typing anywhere on the full page (outside other fields) goes to the question box, like other chat apps.
  useEffect(() => {
    if (!page) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return;
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page]);

  // Sending from the centered box moves the box to the bottom; keep the cursor in it.
  const started = messages.length > 0;
  const wasStarted = useRef(started);
  useEffect(() => {
    if (started && !wasStarted.current) inputRef.current?.focus({ preventScroll: true });
    wasStarted.current = started;
  }, [started]);

  const last = messages[messages.length - 1];
  // Our server sends translated error text; anything else (a dropped connection) gets the general message.
  const errorText = error && error.message && error.message.length < 240 && !error.message.startsWith("{") ? error.message : t("assistant.errorGeneric");
  // Plain search (AI off): say where answers come from; each answer carries its own small tag.
  const hint = root?.aiConfigured === false ? t("assistant.enterHintSearch") : undefined;
  const prompt = (large: boolean) => (
    <PromptInput
      ref={inputRef}
      id={`ask-${variant}`}
      value={draft}
      onChange={setDraft}
      onSubmit={() => send(draft)}
      onStop={onStop}
      busy={busy}
      hint={hint}
      large={large}
    />
  );
  const startExample = (
    <Button type="button" variant="ghost" size="sm" onClick={() => setExample(true)} className={cn("text-smoke", !page && "-ml-2")}>
      <CirclePlay aria-hidden="true" />
      {t("assistant.exampleButton")}
    </Button>
  );

  // The full page's empty chat: a greeting, the question box in the middle, suggestions under it.
  if (page && messages.length === 0 && !example) {
    return (
      // m-auto (not justify-center) so a short screen scrolls instead of cutting off the top.
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
        <div className="m-auto flex w-full flex-col items-center gap-6 py-6 md:pb-[8vh]">
          <div className="grid justify-items-center gap-3 text-center">
            <VillageMark className="size-12" />
            <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">{t("assistant.emptyTitle")}</h2>
            <p className="max-w-md text-sm text-smoke">{t("assistant.description")}</p>
          </div>
          <div className="w-full max-w-3xl">{prompt(true)}</div>
          <ExamplePrompts onPick={send} label={t("dashboard.examplesLabel")} className="max-w-3xl justify-center" />
          {startExample}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p role="status" className="sr-only">
        {announce}
      </p>
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport aria-label={t("assistant.conversationLabel")} aria-busy={busy || undefined} className="scroll-fade-t">
            <MessageScrollerContent
              // The log role stays, but "Answer ready" above is what's read aloud, not each streamed word.
              aria-live="off"
              className={cn("mx-auto w-full gap-7", page ? "max-w-3xl px-1 pt-4 pb-10" : "px-4 py-4")}
            >
              {messages.length === 0 ? (
                example ? (
                  <ExampleConversation
                    onDone={() => {
                      setExample(false);
                      inputRef.current?.focus();
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-start gap-4 py-2">
                    <VillageMark className="size-10" />
                    <div className="space-y-1">
                      <h2 className="text-section">{t("assistant.emptyTitle")}</h2>
                      <p className="text-sm text-smoke">{t("assistant.description")}</p>
                    </div>
                    <ExamplePrompts onPick={send} label={t("dashboard.examplesLabel")} />
                    {startExample}
                  </div>
                )
              ) : (
                messages.map((message) => (
                  <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}>
                    <AskMessageView
                      message={message}
                      busy={busy && message === last}
                      onRegenerate={message === last && message.role === "assistant" && !busy ? () => void regenerate() : undefined}
                    />
                  </MessageScrollerItem>
                ))
              )}
              {status === "submitted" && last?.role === "user" && (
                <div className="flex items-center gap-3 text-sm text-smoke">
                  <VillageMark className="size-7" />
                  <span className="flex gap-1" aria-hidden="true">
                    <span className="size-2 animate-bounce rounded-full bg-gold [animation-delay:-0.3s]" />
                    <span className="size-2 animate-bounce rounded-full bg-gold/70 [animation-delay:-0.15s]" />
                    <span className="size-2 animate-bounce rounded-full bg-gold/40" />
                  </span>
                  {t("assistant.pending")}
                </div>
              )}
              {stopped && !busy && <p className="pl-10 text-xs text-smoke">{t("assistant.stopped")}</p>}
              {error && !busy && (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-rust-soft px-4 py-3 text-sm text-rust-ink">
                  <span className="flex-1">{errorText}</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => void regenerate()}>
                    <RotateCcw aria-hidden="true" />
                    {t("assistant.retry")}
                  </Button>
                </div>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton className="left-1/2 rounded-full shadow-md" aria-label={t("assistant.jumpToLatest")} />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className={cn("shrink-0", page ? "mx-auto w-full max-w-3xl px-1 pt-1" : "border-t border-stone bg-canvas px-3 pt-3 pb-2")}>
        {prompt(false)}
      </div>
    </div>
  );
}

/** The scripted example. "Watch again" starts a fresh run. */
function ExampleConversation({ onDone }: { onDone: () => void }) {
  const [run, setRun] = useState(0);
  return <ExampleRun key={run} onDone={onDone} onReplay={() => setRun((n) => n + 1)} />;
}

function ExampleRun({ onDone, onReplay }: { onDone: () => void; onReplay: () => void }) {
  const { t } = useT();
  // One script and one Chat for the life of this run. useChat({ chat }) leaves a Chat it didn't
  // create alone on unmount, so React's development double-mount doesn't stop the script midway.
  const [script] = useState(() => buildExampleChat(t));
  const [chat] = useState(() => new Chat<AskMessage>({ messages: script.get(0), transport: script.transport() }));
  const { messages, status } = useChat<AskMessage>({ chat });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const next = script.next([]);
    if (next) void chat.sendMessage(next);
  }, [chat, script]);

  const done = status === "ready" && messages.length > 1;
  const last = messages[messages.length - 1];
  return (
    <div className="grid gap-5">
      <div className="grid gap-7" aria-label={t("assistant.exampleBadge")}>
        {messages.map((message) => (
          <AskMessageView key={message.id} message={message} busy={!done && message === last} />
        ))}
      </div>
      {done && (
        <div role="status" className="grid gap-3 rounded-2xl bg-gold-soft/60 p-4 text-sm text-graphite">
          <p>{t("assistant.exampleDone")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="brand" size="sm" onClick={onDone}>
              {t("assistant.exampleTryIt")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onReplay}>
              <RotateCcw aria-hidden="true" />
              {t("assistant.exampleReplay")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
