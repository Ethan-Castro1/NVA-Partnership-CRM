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
import { getNavCounts } from "~/lib/dashboard.server";
import { cn } from "~/lib/utils";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  // Small sidebar counts for admins: overdue follow-ups, new sign-ups, introductions waiting.
  const navCounts = await getNavCounts(user);
  const sidebarOpen = !/(?:^|;\s*)sidebar_state=false/.test(request.headers.get("Cookie") ?? "");
  return data({ user, navCounts, sidebarOpen });
}

export default function AppLayout() {
  return (
    <AssistantProvider>
      <AppShell />
    </AssistantProvider>
  );
}

function AppShell() {
  const { user, navCounts, sidebarOpen } = useLoaderData<typeof loader>();
  const { t } = useT();
  const panelVisible = usePanelVisible();
  const location = useLocation();
  // The Ask page is a full-window chat: no page padding or max width, so its history sits against the sidebar.
  const fullBleed = location.pathname === "/app/ask";
  const q = location.pathname === "/app/people" ? new URLSearchParams(location.search).get("q") ?? "" : "";

  return (
    // The sidebar panel itself is fixed to the viewport; painting its column too keeps the
    // cream wash and edge running the full height of long pages.
    <SidebarProvider
      defaultOpen={sidebarOpen}
      className="md:[&>[data-slot=sidebar]]:bg-sidebar md:[&>[data-slot=sidebar]]:shadow-[inset_-1px_0_0_var(--sidebar-border)]"
    >
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("common.skipToContent")}
      </a>
      <AppSidebar user={user} counts={navCounts} />
      <SidebarInset className={cn("bg-canvas transition-[padding]", panelVisible && PANEL_WIDTH_CLASS, fullBleed && "h-dvh")}>
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 sm:gap-3 border-b border-stone bg-canvas/90 px-4 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-14 md:px-6">
          <SidebarTrigger className="-ml-1 max-md:-ml-3" />
          <Separator orientation="vertical" className="h-5 data-vertical:self-center max-sm:hidden" />
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
            <AssistantToggle />
            <LanguageToggle />
          </div>
        </header>
        <main
          id="main"
          className={cn(
            "w-full flex-1",
            fullBleed ? "flex min-h-0 flex-col" : "mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8",
          )}
        >
          <Outlet />
        </main>
        {/* The Ask page says the same thing under its question box. */}
        {!fullBleed && (
          <footer className="mx-auto w-full max-w-[1280px] px-4 pb-6 text-xs text-smoke md:px-8">{t("common.footer.privacy")}</footer>
        )}
      </SidebarInset>
      <AssistantPanel />
    </SidebarProvider>
  );
}
