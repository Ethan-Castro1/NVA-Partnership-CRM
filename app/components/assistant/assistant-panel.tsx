/**
 * The assistant as a side panel on every staff page. It stays open while
 * people follow links in answers, so they can read a profile and keep
 * asking. On /app/ask the full page shows the same chat instead.
 */
import { Link, useLocation } from "react-router";
import { Maximize2, Sparkles, SquarePen, X } from "lucide-react";
import { useEffect } from "react";
import { VillageMark } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import { cn } from "~/lib/utils";
import { useAssistant } from "./assistant-provider";
import { ChatHistoryMenu } from "./chat-history";
import { AssistantConversation } from "./conversation";

export const PANEL_WIDTH_CLASS = "lg:pr-[420px]";

/** True when the docked panel is showing (the layout makes room for it). */
export function usePanelVisible(): boolean {
  const { panelOpen } = useAssistant();
  const { pathname } = useLocation();
  return panelOpen && pathname !== "/app/ask";
}

export function AssistantPanel() {
  const { t } = useT();
  const { setPanelOpen, newChat } = useAssistant();
  const visible = usePanelVisible();

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && window.innerWidth < 1024) setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, setPanelOpen]);

  if (!visible) return null;
  return (
    <aside
      aria-label={t("assistant.openPanel")}
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-stone bg-canvas shadow-[0_0_40px_-12px_rgba(0,0,0,0.25)] sm:w-[420px] lg:shadow-none"
    >
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-stone px-4">
        <VillageMark className="size-7" />
        <h2 className="min-w-0 flex-1 truncate font-display text-base font-bold">{t("assistant.title")}</h2>
        <ChatHistoryMenu />
        <Button type="button" variant="ghost" size="icon-sm" onClick={newChat} aria-label={t("assistant.newChat")}>
          <SquarePen aria-hidden="true" />
        </Button>
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/app/ask" aria-label={t("assistant.openFullPage")}>
            <Maximize2 aria-hidden="true" />
          </Link>
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPanelOpen(false)} aria-label={t("assistant.closePanel")}>
          <X aria-hidden="true" />
        </Button>
      </header>
      <AssistantConversation variant="panel" />
    </aside>
  );
}

/** The top-bar button that opens or closes the panel. */
export function AssistantToggle({ className }: { className?: string }) {
  const { t } = useT();
  const { panelOpen, setPanelOpen } = useAssistant();
  const { pathname } = useLocation();
  if (pathname === "/app/ask") return null;
  return (
    <Button
      type="button"
      variant={panelOpen ? "outline" : "brand"}
      onClick={() => setPanelOpen(!panelOpen)}
      aria-pressed={panelOpen}
      className={cn("shrink-0", className)}
    >
      <Sparkles aria-hidden="true" />
      <span className="hidden sm:inline">{t("assistant.openPanel")}</span>
    </Button>
  );
}
