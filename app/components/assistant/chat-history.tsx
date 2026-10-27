/** Saved chats: a list on the full assistant page, a menu in the side panel. */
import { History, Loader2, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useT } from "~/i18n";
import { cn } from "~/lib/utils";
import { useAssistant } from "./assistant-provider";

function shortWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function ChatHistoryList() {
  const { t } = useT();
  const { chat, history, openChat, deleteChat, loadingChatId } = useAssistant();
  return (
    <nav aria-label={t("assistant.history")} className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-1.5">
      <h2 className="px-1 text-xs font-medium text-smoke">{t("assistant.history")}</h2>
      {history.length === 0 ? (
        <p className="px-1 text-sm text-smoke">{t("assistant.historyEmpty")}</p>
      ) : (
        <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5">
          {history.map((item) => {
            const current = item.id === chat.id;
            return (
              <li key={item.id} className="group flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => void openChat(item.id)}
                  aria-current={current || undefined}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-graphite transition-colors hover:bg-taupe focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    current && "bg-gold-soft font-medium hover:bg-gold-soft",
                  )}
                >
                  {loadingChatId === item.id && <Loader2 className="size-3.5 shrink-0 animate-spin text-smoke" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => deleteChat(item.id)}
                  aria-label={`${t("assistant.deleteChat")}: ${item.title}`}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

/** `labeled` shows "Past chats" next to the icon (the full page on phones). */
export function ChatHistoryMenu({ labeled = false, className }: { labeled?: boolean; className?: string }) {
  const { t, locale } = useT();
  const { chat, history, openChat } = useAssistant();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {labeled ? (
          <Button type="button" variant="ghost" size="sm" className={cn("max-md:h-10", className)}>
            <History aria-hidden="true" />
            {t("assistant.history")}
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("assistant.history")} className={className}>
            <History aria-hidden="true" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-xl">
        <DropdownMenuLabel>{t("assistant.history")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {history.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-smoke">{t("assistant.historyEmpty")}</p>
        ) : (
          history.slice(0, 15).map((item) => (
            <DropdownMenuItem key={item.id} onSelect={() => void openChat(item.id)} className={cn(item.id === chat.id && "bg-gold-soft")}>
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <span className="shrink-0 text-xs text-smoke">{shortWhen(item.updated_at, locale)}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
