/**
 * "Ask the village" as a full page: saved chats in a slim left column (a
 * "Past chats" menu on phones), the conversation filling the rest. It shows the same chat as the side panel
 * (AssistantProvider), so a conversation can move between the two.
 * /app/ask?q=... asks that question in a new chat.
 */
import { useEffect, useRef } from "react";
import { Link, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/app.ask";
import { useAssistant } from "~/components/assistant/assistant-provider";
import { ChatHistoryList, ChatHistoryMenu } from "~/components/assistant/chat-history";
import { AssistantConversation } from "~/components/assistant/conversation";
import { MAX_MESSAGE_CHARS } from "~/components/assistant/types";
import { ArrowLeft, SquarePen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";

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

export default function Ask() {
  const { q } = useLoaderData<typeof loader>();
  const { t } = useT();
  const { ask, newChat } = useAssistant();
  const navigate = useNavigate();
  const asked = useRef<string | null>(null);

  // Ask ?q= once (from the dashboard or a CAP page), then drop it from the URL.
  useEffect(() => {
    if (!q || asked.current === q) return;
    asked.current = q;
    ask(q);
    navigate("/app/ask", { replace: true, preventScrollReset: true });
  }, [q, ask, navigate]);

  // A chat layout: the page fills the window below the top bar (less the main padding and
  // the one-line footer), the messages scroll inside it and the question box stays at the bottom.
  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-[26rem] min-w-0 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="ghost" size="icon-sm" className="-ml-2 max-md:hidden">
            <Link to="/app" aria-label={t("common.action.back")}>
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
          <h1 className="truncate font-display text-xl font-bold tracking-tight md:text-2xl">{t("assistant.title")}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ChatHistoryMenu labeled className="lg:hidden" />
          <Button type="button" variant="outline" size="sm" onClick={newChat} className="max-sm:size-10 max-sm:px-0 max-md:h-10">
            <SquarePen aria-hidden="true" />
            <span className="max-sm:sr-only">{t("assistant.newChat")}</span>
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 overflow-y-auto border-r border-stone pr-3 lg:block">
          <ChatHistoryList />
        </aside>
        <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-col">
          <AssistantConversation variant="page" />
        </section>
      </div>
    </div>
  );
}
