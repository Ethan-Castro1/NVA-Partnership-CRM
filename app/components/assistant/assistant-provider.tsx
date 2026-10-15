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

const OPEN_KEY = "nva_assistant_open";

type AssistantContextValue = {
  chat: Chat<AskMessage>;
  history: ChatSummary[];
  loadingChatId: string | null;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /** Starts a fresh chat (keeps the current one if it's still empty). */
  newChat: () => void;
  openChat: (id: string) => Promise<void>;
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
  const deleteFetcher = useFetcher();
  const refreshRef = useRef<() => void>(() => {});

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

  // Load the history once, and restore the panel as the person left it.
  useEffect(() => {
    refreshRef.current();
    try {
      if (window.localStorage.getItem(OPEN_KEY) === "1") setPanelOpenState(true);
    } catch {
      // Storage can be blocked; the panel just starts closed.
    }
  }, []);

  const setPanelOpen = useCallback((open: boolean) => {
    setPanelOpenState(open);
    try {
      window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      // Not critical.
    }
  }, []);

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

  const deleteChat = useCallback(
    (id: string) => {
      deleteFetcher.submit({ intent: "delete", id }, { method: "post", action: "/app/assistant/chats" });
      if (id === chat.id) setChat(makeChat(newChatId()));
      toast.success(t("assistant.chatDeleted"));
    },
    [chat.id, deleteFetcher, makeChat, t],
  );

  // After a delete finishes, refresh the list.
  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data) refreshRef.current();
  }, [deleteFetcher.state, deleteFetcher.data]);

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
      history: historyFetcher.data?.chats ?? [],
      loadingChatId,
      panelOpen,
      setPanelOpen,
      newChat,
      openChat,
      deleteChat,
      ask,
    }),
    [chat, historyFetcher.data, loadingChatId, panelOpen, setPanelOpen, newChat, openChat, deleteChat, ask],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistant must be used inside AssistantProvider");
  return value;
}
