/**
 * Saved chats. On the full page: a sidebar grouped by date (Today, Yesterday,
 * Previous 7 days...) with a search box, which collapses, and a sheet on
 * smaller screens. In the side panel: a compact menu.
 */
import { History, Loader2, Search, SquarePen, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { useT, type MessageKey } from "~/i18n";
import { cn } from "~/lib/utils";
import { useAssistant } from "./assistant-provider";
import type { ChatSummary } from "./chat-types";

/** "3:40 PM" today, "Oct 21" this year, "Oct 21, 2025" before that. */
function shortWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

type Group = { key: MessageKey; items: ChatSummary[] };

/** Chats grouped the way chat apps do: Today, Yesterday, Previous 7 days, Previous 30 days, Older. */
export function groupChats(items: ChatSummary[], now = new Date()): Group[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  const bucket = (iso: string): MessageKey => {
    const t = new Date(iso).getTime();
    if (t >= startOfToday) return "assistant.group.today";
    if (t >= startOfToday - day) return "assistant.group.yesterday";
    if (t >= startOfToday - 7 * day) return "assistant.group.week";
    if (t >= startOfToday - 30 * day) return "assistant.group.month";
    return "assistant.group.older";
  };
  const groups: Group[] = [];
  for (const item of items) {
    const key = bucket(item.updated_at);
    const group = groups.find((g) => g.key === key);
    if (group) group.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}

/** The full page's history: New chat, a search box once there are a few chats, then the chats by date. */
export function ChatHistoryList({ onPicked, className }: { onPicked?: () => void; className?: string }) {
  const { t } = useT();
  const { chat, history, openChat, deleteChat, loadingChatId, newChat } = useAssistant();
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? history.filter((item) => item.title.toLowerCase().includes(q)) : history;
  }, [history, filter]);
  const groups = useMemo(() => groupChats(shown), [shown]);

  return (
    <nav aria-label={t("assistant.history")} className={cn("flex min-h-0 min-w-0 flex-col gap-3", className)}>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start gap-2 bg-canvas"
        onClick={() => {
          newChat();
          onPicked?.();
        }}
      >
        <SquarePen aria-hidden="true" />
        {t("assistant.newChat")}
      </Button>
      {history.length > 5 && (
        <InputGroup className="bg-canvas">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t("assistant.historySearch")}
            aria-label={t("assistant.historySearch")}
          />
        </InputGroup>
      )}
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {history.length === 0 ? (
          <p className="px-2 text-sm text-smoke">{t("assistant.historyEmpty")}</p>
        ) : groups.length === 0 ? (
          <p className="px-2 text-sm text-smoke">{t("assistant.historyNoMatch")}</p>
        ) : (
          <div className="grid gap-4">
            {groups.map((group) => (
              <section key={group.key} aria-label={t(group.key)}>
                <h3 className="px-2 pb-1 text-xs font-medium text-smoke">{t(group.key)}</h3>
                <ul className="grid gap-0.5">
                  {group.items.map((item) => {
                    const current = item.id === chat.id;
                    return (
                      <li key={item.id} className="group/chat relative flex min-w-0 items-center">
                        <button
                          type="button"
                          onClick={() => {
                            void openChat(item.id);
                            onPicked?.();
                          }}
                          aria-current={current || undefined}
                          title={item.title}
                          className={cn(
                            "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 pr-9 text-left text-sm text-graphite transition-colors hover:bg-taupe focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                            current && "bg-gold-soft font-medium text-ink hover:bg-gold-soft",
                          )}
                        >
                          {loadingChatId === item.id && <Loader2 className="size-3.5 shrink-0 animate-spin text-smoke" aria-hidden="true" />}
                          <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => deleteChat(item.id)}
                          aria-label={`${t("assistant.deleteChat")}: ${item.title}`}
                          className="absolute right-1.5 text-smoke opacity-0 group-hover/chat:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

/** Below the wide layout: the same list in a sheet from the left. */
export function ChatHistorySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-80 max-w-[85vw] flex-col gap-0 bg-canvas p-0">
        <SheetHeader className="border-b border-stone px-4 py-3">
          <SheetTitle>{t("assistant.history")}</SheetTitle>
          <SheetDescription className="sr-only">{t("assistant.description")}</SheetDescription>
        </SheetHeader>
        <ChatHistoryList className="flex-1 p-3" onPicked={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

/** The side panel's history: a compact menu of the 15 latest chats. */
export function ChatHistoryMenu({ className }: { className?: string }) {
  const { t, locale } = useT();
  const { chat, history, openChat, deleteChat } = useAssistant();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("assistant.history")} className={className}>
          <History aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)] rounded-xl">
        <DropdownMenuLabel>{t("assistant.history")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {history.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-smoke">{t("assistant.historyEmpty")}</p>
        ) : (
          history.slice(0, 15).map((item) => (
            <div key={item.id} role="none" className="flex items-center gap-0.5">
              <DropdownMenuItem
                onSelect={() => void openChat(item.id)}
                className={cn("min-w-0 flex-1 max-md:min-h-10", item.id === chat.id && "bg-gold-soft")}
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="shrink-0 text-xs text-smoke">{shortWhen(item.updated_at, locale)}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => deleteChat(item.id)}
                aria-label={`${t("assistant.deleteChat")}: ${item.title}`}
                className="shrink-0 justify-center text-smoke max-md:size-10"
              >
                <Trash2 aria-hidden="true" />
              </DropdownMenuItem>
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
