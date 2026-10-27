/**
 * Holds the assistant for the whole staff app: the current chat (an AI SDK
 * Chat), the saved-chat list, and whether the side panel is open. It lives in
 * the app layout, so a conversation keeps going while staff follow links to
 * other pages, and the panel and the full /app/ask page show the same chat.
 */
import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { useT } from "~/i18n";
import type { AskMessage, ChatSummary } from "./chat-types";

type AssistantContextValue = {
  chat: Chat<AskMessage>;
  history: ChatSummary[];
  loadingChatId: string | null;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /** Starts a fresh chat (keeps the current one if it's still empty). */
  newChat: () => void;
  openChat: (id: string) => Promise<void>;
  /** Hides a chat at once and deletes it when the "Chat deleted" toast closes, unless Undo is clicked. */
  deleteChat: (id: string) => void;
  /** Asks a question in a new chat and opens the panel (used by "Ask" buttons around the app). */
  ask: (text: string, options?: { inPanel?: boolean }) => void;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

const newChatId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const historyFetcher = useFetcher<{ chats: ChatSummary[] }>();
  const refreshRef = useRef<() => void>(() => {});
  /** Chats deleted from the list whose toast is still up (Undo brings them back). */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const pendingDeletes = useRef(new Set<string>());

  const makeChat = useCallback(
    (id: string, messages: AskMessage[] = []) =>
      new Chat<AskMessage>({
        id,
        messages,
        transport: new DefaultChatTransport({ api: "/app/assistant/chat" }),
        onFinish: () => refreshRef.current(),
      }),
    [],
  );

  const [chat, setChat] = useState(() => makeChat(newChatId()));
  const [panelOpen, setPanelOpenState] = useState(false);
  const [loadingChatId, setLoadingChatId] = useState<string | null>(null);

  refreshRef.current = () => historyFetcher.load("/app/assistant/chats");

  // Load the history once. The panel always starts closed: it opens only when someone asks for it.
  useEffect(() => {
    refreshRef.current();
  }, []);

  const setPanelOpen = useCallback((open: boolean) => setPanelOpenState(open), []);

  const newChat = useCallback(() => {
    if (chat.messages.length === 0 && chat.status === "ready") return;
    chat.stop();
    setChat(makeChat(newChatId()));
  }, [chat, makeChat]);

  const openChat = useCallback(
    async (id: string) => {
      if (id === chat.id) return;
      setLoadingChatId(id);
      try {
        const response = await fetch(`/app/assistant/chats/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error(String(response.status));
        const { chat: saved } = (await response.json()) as { chat: { id: string; messages: AskMessage[] } };
        chat.stop();
        setChat(makeChat(saved.id, saved.messages));
      } catch {
        toast.error(t("common.state.error"));
      } finally {
        setLoadingChatId(null);
      }
    },
    [chat, makeChat, t],
  );

  const chatRef = useRef(chat);
  chatRef.current = chat;

  /** Sends the delete. keepalive lets it finish even if the page is closing. */
  const commitDelete = useCallback((id: string) => {
    if (!pendingDeletes.current.delete(id)) return;
    const body = new FormData();
    body.set("intent", "delete");
    body.set("id", id);
    void fetch("/app/assistant/chats", { method: "POST", body, keepalive: true })
      .catch(() => {})
      .finally(() => refreshRef.current());
  }, []);

  const deleteChat = useCallback(
    (id: string) => {
      const previous = chatRef.current;
      const wasCurrent = id === previous.id;
      pendingDeletes.current.add(id);
      setHidden((set) => new Set(set).add(id));
      if (wasCurrent) {
        previous.stop();
        setChat(makeChat(newChatId()));
      }
      toast.success(t("assistant.chatDeleted"), {
        action: {
          label: t("common.action.undo"),
          onClick: () => {
            pendingDeletes.current.delete(id);
            setHidden((set) => {
              const next = new Set(set);
              next.delete(id);
              return next;
            });
            // Reopen it if it was showing and nothing new was asked since.
            const now = chatRef.current;
            if (wasCurrent && now.messages.length === 0 && now.status === "ready") setChat(previous);
          },
        },
        onAutoClose: () => commitDelete(id),
        onDismiss: () => commitDelete(id),
      });
    },
    [commitDelete, makeChat, t],
  );

  // Deletes still waiting on their toast go through if the app is left or closed.
  useEffect(() => {
    const flush = () => [...pendingDeletes.current].forEach(commitDelete);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [commitDelete]);

  const ask = useCallback(
    (text: string, options: { inPanel?: boolean } = {}) => {
      const content = text.trim();
      if (!content) return;
      const target = chat.messages.length === 0 && chat.status === "ready" ? chat : makeChat(newChatId());
      if (target !== chat) {
        chat.stop();
        setChat(target);
      }
      if (options.inPanel) setPanelOpen(true);
      void target.sendMessage({ text: content });
    },
    [chat, makeChat, setPanelOpen],
  );

  const value = useMemo<AssistantContextValue>(
    () => ({
      chat,
      history: (historyFetcher.data?.chats ?? []).filter((item) => !hidden.has(item.id)),
      loadingChatId,
      panelOpen,
      setPanelOpen,
      newChat,
      openChat,
      deleteChat,
      ask,
    }),
    [chat, historyFetcher.data, hidden, loadingChatId, panelOpen, setPanelOpen, newChat, openChat, deleteChat, ask],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistant must be used inside AssistantProvider");
  return value;
}
