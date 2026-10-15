/** The staff app shell: sidebar-07 (collapses to icons) + a slim top bar. */
import { Form, Outlet, data, useLoaderData, useLocation } from "react-router";
import { Search } from "lucide-react";
import type { Route } from "./+types/app";
import { AppSidebar } from "~/components/app-sidebar";
import { AssistantPanel, AssistantToggle, PANEL_WIDTH_CLASS, usePanelVisible } from "~/components/assistant/assistant-panel";
import { AssistantProvider } from "~/components/assistant/assistant-provider";
import { LanguageToggle } from "~/components/nva";
import { Separator } from "~/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar";
import { useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { queryOne } from "~/lib/db.server";
import { cn } from "~/lib/utils";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const newSignups =
    user.role === "admin"
      ? ((await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM intake_submissions WHERE status = 'new'"))?.n ?? 0)
      : 0;
  const sidebarOpen = !/(?:^|;\s*)sidebar_state=false/.test(request.headers.get("Cookie") ?? "");
  return data({ user, newSignups, sidebarOpen });
}

export default function AppLayout() {
  return (
    <AssistantProvider>
      <AppShell />
    </AssistantProvider>
  );
}

function AppShell() {
  const { user, newSignups, sidebarOpen } = useLoaderData<typeof loader>();
  const { t } = useT();
  const panelVisible = usePanelVisible();
  const location = useLocation();
  const q = location.pathname === "/app/people" ? new URLSearchParams(location.search).get("q") ?? "" : "";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("common.skipToContent")}
      </a>
      <AppSidebar user={user} newSignups={newSignups} />
      <SidebarInset className={cn("bg-canvas transition-[padding]", panelVisible && PANEL_WIDTH_CLASS)}>
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-stone bg-canvas/90 px-4 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-14 md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />
          <Form method="get" action="/app/people" role="search" className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-smoke" aria-hidden="true" />
            <label htmlFor="global-search" className="sr-only">
              {t("common.action.search")}
            </label>
            <input
              id="global-search"
              key={q}
              name="q"
              defaultValue={q}
              placeholder={t("dashboard.searchPlaceholder")}
              className="h-10 w-full rounded-full border border-stone bg-taupe pr-4 pl-10 text-sm outline-none placeholder:text-smoke focus-visible:border-gold focus-visible:bg-canvas focus-visible:ring-3 focus-visible:ring-ring/40"
            />
          </Form>
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle />
            <AssistantToggle />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
        <footer className="mx-auto w-full max-w-[1280px] px-4 pb-6 text-xs text-smoke md:px-8">{t("common.footer.privacy")}</footer>
      </SidebarInset>
      <AssistantPanel />
    </SidebarProvider>
  );
}
