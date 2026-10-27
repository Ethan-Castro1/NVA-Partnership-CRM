import { Form, Link } from "react-router";
import { ChevronsUpDownIcon, LogOutIcon, Plug, UserRound } from "lucide-react";
import { PersonAvatar } from "~/components/nva";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "~/components/ui/sidebar";
import { useT } from "~/i18n";
import type { SessionUser } from "~/lib/types";

export function NavUser({ user }: { user: SessionUser }) {
  const { isMobile } = useSidebar();
  const { t } = useT();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <PersonAvatar name={user.name} className="size-8" />
              <div className="grid flex-1 text-left text-[15px] leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-[13px] text-smoke">{t(`common.role.${user.role}`)}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-xl"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <PersonAvatar name={user.name} className="size-8" />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-smoke">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/app/account">
                  <UserRound />
                  {t("common.nav.account")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/app/connect">
                  <Plug />
                  {t("account.connect.title")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Form method="post" action="/logout" className="w-full">
                <button type="submit" className="flex w-full items-center gap-2">
                  <LogOutIcon className="size-4" />
                  {t("common.nav.signOut")}
                </button>
              </Form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
