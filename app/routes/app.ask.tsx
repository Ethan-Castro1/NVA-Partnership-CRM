/**
 * "Ask the village" as a full page: saved chats on the left, the
 * conversation on the right. It shows the same chat as the side panel
 * (AssistantProvider), so a conversation can move between the two.
 * /app/ask?q=... asks that question in a new chat.
 */
import { useEffect, useRef } from "react";
import { useLoaderData, useNavigate, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/app.ask";
import { useAssistant } from "~/components/assistant/assistant-provider";
import { ChatHistoryList } from "~/components/assistant/chat-history";
import { AssistantConversation } from "~/components/assistant/conversation";
import { MAX_MESSAGE_CHARS } from "~/components/assistant/types";
import { AiNotice, PageHeader } from "~/components/nva";
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
  const root = useRouteLoaderData("root") as { aiConfigured?: boolean } | undefined;
  const { t } = useT();
  const { ask } = useAssistant();
  const navigate = useNavigate();
  const asked = useRef<string | null>(null);

  // Ask ?q= once (from the dashboard or a CAP page), then drop it from the URL.
  useEffect(() => {
    if (!q || asked.current === q) return;
    asked.current = q;
    ask(q);
    navigate("/app/ask", { replace: true, preventScrollReset: true });
  }, [q, ask, navigate]);

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow={t("assistant.eyebrow")} title={t("assistant.title")} description={t("assistant.description")} />
      {root?.aiConfigured === false && <AiNotice />}
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
        <aside className="order-2 lg:order-1 lg:sticky lg:top-24">
          <ChatHistoryList />
        </aside>
        <section className="order-1 flex min-h-[60vh] flex-col lg:order-2">
          <AssistantConversation variant="page" />
        </section>
      </div>
    </div>
  );
}
