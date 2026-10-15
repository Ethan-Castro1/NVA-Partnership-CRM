import * as React from "react";
import { Link } from "react-router";
import {
  Building2,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  Network,
  UserCog,
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

export function AppSidebar({
  user,
  newSignups = 0,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: SessionUser; newSignups?: number }) {
  const { t } = useT();

  // Record types and the daily inbox. The assistant lives in the top bar, setup in the user menu.
  const main: NavItem[] = [
    { title: t("common.nav.dashboard"), url: "/app", icon: <LayoutDashboard />, end: true },
    { title: t("common.nav.people"), url: "/app/people", icon: <Users /> },
    { title: t("common.nav.caps"), url: "/app/caps", icon: <FolderKanban /> },
    { title: t("common.nav.connections"), url: "/app/connections", icon: <Network /> },
    ...(user.role === "admin"
      ? [{ title: t("common.nav.intake"), url: "/app/admin/intake", icon: <ClipboardList />, badge: newSignups || undefined }]
      : []),
  ];
  const manage: NavItem[] = [
    { title: t("common.nav.adminOverview"), url: "/app/admin", icon: <Building2 />, end: true },
    { title: t("common.nav.users"), url: "/app/admin/users", icon: <UserCog /> },
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
                  <span className="truncate text-xs text-smoke">{t("common.appName")}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain label={t("common.nav.teacherSection")} items={main} />
        {user.role === "admin" && <NavMain label={t("common.nav.adminSection")} items={manage} />}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
