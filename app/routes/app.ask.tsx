/**
 * "Ask the village" as a full page, laid out like other chat apps: saved chats
 * in a sidebar on the left (grouped by date, searchable, collapsible; a sheet
 * on smaller screens), the conversation filling the rest. It shows the same
 * chat as the side panel (AssistantProvider), so a conversation can move
 * between the two. /app/ask?q=... asks that question in a new chat.
 */
import { useEffect, useRef, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { PanelLeftClose, PanelLeftOpen, SquarePen } from "lucide-react";
import type { Route } from "./+types/app.ask";
import { useAssistant } from "~/components/assistant/assistant-provider";
import { ChatHistoryList, ChatHistorySheet } from "~/components/assistant/chat-history";
import { AssistantConversation } from "~/components/assistant/conversation";
import { MAX_MESSAGE_CHARS } from "~/components/assistant/types";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { makeT, useT } from "~/i18n";
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

/** Whether the past-chats sidebar is open on wide screens. Remembered per browser (a convenience only). */
const HISTORY_KEY = "nva.ask.history";
function useHistoryOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(HISTORY_KEY) === "closed") setOpen(false);
    } catch {
      // Storage blocked: start open.
    }
  }, []);
  const set = (next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(HISTORY_KEY, next ? "open" : "closed");
    } catch {
      // Not remembered; fine.
    }
  };
  return [open, set];
}

/** Wide enough for the sidebar beside the chat (Tailwind lg). */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

export default function Ask() {
  const { q } = useLoaderData<typeof loader>();
  const { t } = useT();
  const { ask, newChat } = useAssistant();
  const navigate = useNavigate();
  const asked = useRef<string | null>(null);
  const [historyOpen, setHistoryOpen] = useHistoryOpen();
  const [sheetOpen, setSheetOpen] = useState(false);
  const wide = useWide();

  // Ask ?q= once (from the dashboard or a CAP page), then drop it from the URL.
  useEffect(() => {
    if (!q || asked.current === q) return;
    asked.current = q;
    ask(q);
    navigate("/app/ask", { replace: true, preventScrollReset: true });
  }, [q, ask, navigate]);

  const sidebarShown = wide && historyOpen;
  const toggleLabel = sidebarShown ? t("assistant.historyHide") : t("assistant.historyShow");
  const toggle = () => (wide ? setHistoryOpen(!historyOpen) : setSheetOpen(true));

  // A chat layout: the page fills the window below the top bar (the layout drops its padding here), the history
  // sits against the app sidebar, the messages scroll inside and the question box stays at the bottom.
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <aside
        aria-hidden={!sidebarShown || undefined}
        inert={!sidebarShown || undefined}
        className={cn(
          "hidden shrink-0 overflow-hidden border-stone transition-[width,opacity] duration-200 ease-out lg:block",
          sidebarShown ? "w-64 border-r opacity-100" : "w-0 opacity-0",
        )}
      >
        <div className="flex h-full w-64 flex-col p-3">
          <ChatHistoryList className="flex-1" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-2 px-4 pt-3 pb-3 md:px-6">
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={toggle}
                aria-label={toggleLabel}
                aria-expanded={wide ? historyOpen : sheetOpen}
                className="-ml-1.5 text-graphite max-md:size-10"
              >
                {sidebarShown ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{toggleLabel}</TooltipContent>
          </Tooltip>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold tracking-tight md:text-xl">{t("assistant.title")}</h1>
          {/* With the sidebar open, New chat is at its top; otherwise here. */}
          {!sidebarShown && (
            <Button type="button" variant="outline" size="sm" onClick={newChat} className="max-sm:size-10 max-sm:px-0 max-md:h-10">
              <SquarePen aria-hidden="true" />
              <span className="max-sm:sr-only">{t("assistant.newChat")}</span>
            </Button>
          )}
        </div>
        <section className="flex min-h-0 w-full flex-1 flex-col">
          <AssistantConversation variant="page" />
        </section>
      </div>

      {!wide && <ChatHistorySheet open={sheetOpen} onOpenChange={setSheetOpen} />}
    </div>
  );
}
