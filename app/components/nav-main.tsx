import { NavLink, useLocation } from "react-router";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";

export type NavItem = {
  title: string;
  url: string;
  icon?: React.ReactNode;
  /** Only active on an exact match (for index pages like /app). */
  end?: boolean;
  badge?: number;
};

export function NavMain({ label, items }: { label: string; items: NavItem[] }) {
  const { pathname } = useLocation();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const active = item.end ? pathname === item.url : pathname === item.url || pathname.startsWith(`${item.url}/`);
          return (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                asChild
                isActive={active}
                tooltip={item.title}
                className="data-[active=true]:bg-gold-soft data-[active=true]:font-semibold [&>svg]:text-graphite data-[active=true]:[&>svg]:text-gold-ink"
              >
                <NavLink to={item.url} end={item.end}>
                  {item.icon}
                  <span>{item.title}</span>
                </NavLink>
              </SidebarMenuButton>
              {item.badge ? (
                <SidebarMenuBadge className="rounded-full bg-gold px-1.5 text-ink">{item.badge}</SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
