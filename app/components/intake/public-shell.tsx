/**
 * The frame shared by the public pages (home, join, thanks): a minimal top
 * bar and a compact footer. Staff pages use the sidebar shell instead.
 */
import { Link, useRouteLoaderData } from "react-router";
import type { ReactNode } from "react";
import { LanguageToggle, VillageMark, Wordmark } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import type { SessionUser } from "~/lib/types";
import { cn } from "~/lib/utils";

/** Jump link for keyboard users; visible only when focused. */
export function SkipLink() {
  const { t } = useT();
  return (
    <a
      href="#main"
      className="sr-only rounded-full bg-ink px-4 py-2 text-sm text-canvas focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
    >
      {t("common.skipToContent")}
    </a>
  );
}

export function PublicTopBar({ className, showStaffLink = true }: { className?: string; showStaffLink?: boolean }) {
  const { t } = useT();
  const root = useRouteLoaderData("root") as { user?: SessionUser | null } | undefined;
  return (
    <header className={cn("mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 md:px-8", className)}>
      <Link
        to="/"
        aria-label={t("public.homeLink")}
        className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Wordmark className="hidden sm:flex" />
        <VillageMark className="size-9 sm:hidden" />
      </Link>
      <div className="flex items-center gap-2">
        <LanguageToggle />
        {showStaffLink &&
          (root?.user ? (
            <Button asChild variant="outline">
              <Link to="/app">{t("public.goToDashboard")}</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/login">{t("common.nav.signIn")}</Link>
            </Button>
          ))}
      </div>
    </header>
  );
}

export function PublicFooter({ children }: { children?: ReactNode }) {
  const { t } = useT();
  return (
    <footer className="border-t border-stone">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-smoke md:flex-row md:items-start md:justify-between md:px-8">
        <div className="space-y-1.5">
          <p className="font-display text-xs font-bold tracking-[0.06em] text-graphite uppercase">
            {t("common.schoolName")}
          </p>
          <p>{t("common.tagline")}</p>
          <p className="font-medium text-graphite">{t("public.hashtags")}</p>
        </div>
        <p className="max-w-md md:text-right">{t("public.footerPrivacy")}</p>
        {children}
      </div>
    </footer>
  );
}
