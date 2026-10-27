import * as React from "react";
import { Link } from "react-router";
import {
  BookUser,
  CalendarClock,
  FolderKanban,
  HandHelping,
  Inbox,
  LayoutDashboard,
  Mail,
  MessagesSquare,
  Network,
  Settings,
  Target,
  UserPlus,
  Users,
} from "lucide-react";
import { NavMain, type NavItem } from "~/components/nav-main";
import { NavUser } from "~/components/nav-user";
import { VillageMark } from "~/components/nva";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar";
import { useT } from "~/i18n";
import type { SessionUser } from "~/lib/types";

/** The sidebar's small numbers (all zero for staff). */
export type NavCounts = { overdueFollowUps: number; newSignups: number; introductions: number };

const NO_COUNTS: NavCounts = { overdueFollowUps: 0, newSignups: 0, introductions: 0 };

export function AppSidebar({
  user,
  counts = NO_COUNTS,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: SessionUser; counts?: NavCounts }) {
  const { t } = useT();

  // Ask the Village is the full-screen chat; the side panel opens from the top bar.
  const dashboard: NavItem = { title: t("common.nav.dashboard"), url: "/app", icon: <LayoutDashboard />, end: true };
  const ask: NavItem = { title: t("common.nav.ask"), url: "/app/ask", icon: <MessagesSquare /> };
  const caps: NavItem = { title: t("common.nav.caps"), url: "/app/caps", icon: <FolderKanban /> };

  const items: NavItem[] =
    user.role === "admin"
      ? [
          dashboard,
          ask,
          { title: t("common.nav.peopleOrgs"), url: "/app/people", icon: <Users />, also: ["/app/organizations"] },
          { title: t("common.nav.connections"), url: "/app/connections", icon: <Network /> },
          { title: t("common.nav.opportunities"), url: "/app/opportunities", icon: <Target /> },
          {
            title: t("common.nav.followUps"),
            url: "/app/follow-ups",
            icon: <CalendarClock />,
            badge: counts.overdueFollowUps,
            badgeLabel: t("common.nav.badgeOverdue", { count: counts.overdueFollowUps }),
            badgeTone: "alert",
          },
          {
            title: t("common.nav.staffRequests"),
            url: "/app/admin/requests",
            icon: <HandHelping />,
            badge: counts.introductions,
            badgeLabel: t("common.nav.badgeIntros", { count: counts.introductions }),
          },
          caps,
          { title: t("common.nav.communications"), url: "/app/communications", icon: <Mail /> },
          {
            title: t("common.nav.signups"),
            url: "/app/admin/intake",
            icon: <UserPlus />,
            badge: counts.newSignups,
            badgeLabel: t("common.nav.badgeSignups", { count: counts.newSignups }),
          },
          { title: t("common.nav.settings"), url: "/app/admin/settings", icon: <Settings />, also: ["/app/admin/users"] },
        ]
      : [
          dashboard,
          ask,
          { title: t("common.nav.browse"), url: "/app/people", icon: <Users /> },
          { title: t("common.nav.myRequests"), url: "/app/requests", icon: <Inbox /> },
          caps,
          { title: t("common.nav.myConnections"), url: "/app/my-connections", icon: <BookUser /> },
        ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={t("common.schoolName")}>
              <Link to="/app">
                <VillageMark className="size-8 shrink-0" />
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-display text-[0.78rem] font-bold tracking-[0.06em] uppercase">
                    {t("common.schoolName")}
                  </span>
                  <span className="truncate text-[13px] text-smoke">{t("common.appName")}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={items} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
