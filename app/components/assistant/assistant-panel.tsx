/**
 * The assistant as a side panel on every staff page. On wide screens (2xl,
 * 1536px and up) it docks beside the page and stays open while people follow
 * links in answers. Below that it opens as a sheet over the right side of the
 * page (a dialog: focus stays inside, Escape closes it, and focus goes back to
 * the top-bar button), so the page keeps its full width. On /app/ask the full
 * page shows the same chat instead.
 */
import { Link, useLocation } from "react-router";
import { Maximize2, MessagesSquare, SquarePen, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { VillageMark } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import { cn } from "~/lib/utils";
import { useAssistant } from "./assistant-provider";
import { ChatHistoryMenu } from "./chat-history";
import { AssistantConversation } from "./conversation";

/** The page makes room for the panel only where it docks (Tailwind's 2xl). */
export const PANEL_WIDTH_CLASS = "2xl:pr-[420px]";
const DOCK_QUERY = "(min-width: 1536px)";
const TOGGLE_ID = "assistant-toggle";
const TITLE_ID = "assistant-panel-title";
/** The question box in the panel (conversation.tsx names it ask-<variant>). */
const INPUT_ID = "ask-panel";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** True when the window is wide enough for the panel to dock beside the page. */
function useDocked(): boolean {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(DOCK_QUERY);
    const update = () => setDocked(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return docked;
}

/** True when the panel is showing (open, and not on the full /app/ask page). */
export function usePanelVisible(): boolean {
  const { panelOpen } = useAssistant();
  const { pathname } = useLocation();
  return panelOpen && pathname !== "/app/ask";
}

export function AssistantPanel() {
  const { t } = useT();
  const { setPanelOpen, newChat } = useAssistant();
  const visible = usePanelVisible();
  const docked = useDocked();
  const asideRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const firstPath = useRef(true);

  const close = useCallback(() => {
    setPanelOpen(false);
    // Back to the button that opened it.
    requestAnimationFrame(() => document.getElementById(TOGGLE_ID)?.focus());
  }, [setPanelOpen]);

  // Opening the panel puts the cursor in the question box.
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => document.getElementById(INPUT_ID)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  // Escape closes the panel when focus is inside it (so a menu or dialog on top keeps its own Escape).
  // As a sheet, Tab and Shift+Tab also stay inside it.
  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      const aside = asideRef.current;
      if (!aside) return;
      const inside = aside.contains(document.activeElement);
      if (event.key === "Escape" && inside && !event.defaultPrevented) {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || docked) return;
      // Focus in a menu or dialog opened from the panel (rendered elsewhere) is left alone.
      if (!inside && document.activeElement && document.activeElement !== document.body) return;
      const items = [...aside.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!inside) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, docked, close]);

  // When the panel covers the page, following a link in an answer closes it so the page shows.
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    if (!window.matchMedia(DOCK_QUERY).matches) setPanelOpen(false);
  }, [pathname, setPanelOpen]);

  if (!visible) return null;
  return (
    <>
      {!docked && <div aria-hidden="true" onClick={close} className="fixed inset-0 z-40 bg-black/20 max-sm:hidden" />}
      <aside
        ref={asideRef}
        role={docked ? "complementary" : "dialog"}
        aria-modal={docked ? undefined : true}
        aria-labelledby={TITLE_ID}
        className={cn(
          "fixed inset-y-0 right-0 flex w-full flex-col border-l border-stone bg-canvas sm:w-[420px]",
          docked ? "z-40" : "z-50 shadow-[0_0_40px_-12px_rgba(0,0,0,0.25)]",
        )}
      >
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-stone px-4">
          <VillageMark className="size-7" />
          <h2 id={TITLE_ID} className="min-w-0 flex-1 truncate font-display text-base font-bold">
            {t("assistant.title")}
          </h2>
          <ChatHistoryMenu />
          <Button type="button" variant="ghost" size="icon-sm" onClick={newChat} aria-label={t("assistant.newChat")}>
            <SquarePen aria-hidden="true" />
          </Button>
          <Button asChild variant="ghost" size="icon-sm">
            <Link to="/app/ask" aria-label={t("assistant.openFullPage")}>
              <Maximize2 aria-hidden="true" />
            </Link>
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={close} aria-label={t("assistant.closePanel")}>
            <X aria-hidden="true" />
          </Button>
        </header>
        <AssistantConversation variant="panel" />
      </aside>
    </>
  );
}

/** The top-bar button that opens or closes the panel. Its name is the same at every width. */
export function AssistantToggle({ className }: { className?: string }) {
  const { t } = useT();
  const { panelOpen, setPanelOpen } = useAssistant();
  const { pathname } = useLocation();
  if (pathname === "/app/ask") return null;
  return (
    <Button
      id={TOGGLE_ID}
      type="button"
      variant={panelOpen ? "secondary" : "ghost"}
      onClick={() => setPanelOpen(!panelOpen)}
      aria-pressed={panelOpen}
      aria-label={t("assistant.openPanel")}
      // A quiet way in: a plain button, icon only (44px) on phones.
      className={cn("shrink-0 font-normal text-graphite max-sm:size-11 max-sm:px-0", className)}
    >
      <MessagesSquare aria-hidden="true" />
      <span className="hidden sm:inline" aria-hidden="true">
        {t("assistant.openPanel")}
      </span>
    </Button>
  );
}
