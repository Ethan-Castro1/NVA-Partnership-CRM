import { NavLink, useLocation } from "react-router";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { cn } from "~/lib/utils";

export type NavItem = {
  title: string;
  url: string;
  icon?: React.ReactNode;
  /** Only active on an exact match (for index pages like /app). */
  end?: boolean;
  /** Other path prefixes that also mark this item active (e.g. /app/organizations under People). */
  also?: string[];
  /** A small count next to the item; 0 or undefined hides it. */
  badge?: number;
  /** Read by screen readers instead of the bare number ("3 overdue"). */
  badgeLabel?: string;
  /** "alert" for things past due (rust); default is the quiet gold. */
  badgeTone?: "default" | "alert";
};

const matches = (pathname: string, url: string) => pathname === url || pathname.startsWith(`${url}/`);

export function NavMain({ label, items }: { label?: string; items: NavItem[] }) {
  const { pathname } = useLocation();
  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => {
          const active = item.end
            ? pathname === item.url
            : matches(pathname, item.url) || (item.also ?? []).some((url) => matches(pathname, url));
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
                  {item.badge && item.badgeLabel ? <span className="sr-only">, {item.badgeLabel}</span> : null}
                </NavLink>
              </SidebarMenuButton>
              {item.badge ? (
                <SidebarMenuBadge
                  aria-hidden={item.badgeLabel ? true : undefined}
                  className={cn(
                    "rounded-full px-1.5 tabular-nums",
                    item.badgeTone === "alert" ? "bg-rust-soft text-rust-ink" : "bg-gold-soft text-gold-ink",
                  )}
                >
                  {item.badge}
                </SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
