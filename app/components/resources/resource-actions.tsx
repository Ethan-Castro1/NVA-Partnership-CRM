/**
 * What you can do with a person in a list or on a profile: one main action
 * (Contact for direct-contact people whose email or phone the viewer has,
 * otherwise Request introduction) plus a Save icon toggle. Names elsewhere link
 * to the profile, so there is no "View profile" button unless `showProfile` is
 * set (for places without a name link).
 *
 * Admins reach anyone directly and never see Request introduction; when an
 * admin has no email or phone for someone, there is no main action.
 *
 * "Track as a request" (the request form with this person filled in) lives in
 * a small ⋯ menu, shown on the profile (non-compact) or with `showMenu`.
 * `variant="icons"` is the admin table cell: a contact icon and a ⋯ menu
 * holding Call, Save and Track as a request.
 * Save posts to /app/saved, which checks the viewer can see the person. The
 * pressed state reads "Saved" (aria-pressed on the button, a checked item in
 * the table menu, a visible label on the profile), and a save shows a small
 * "Saved to My Connections" toast with a link there.
 *
 *   <ResourceActions person={hit} saved={savedIds.has(hit.id)} compact />
 */
import { useEffect, useRef } from "react";
import { Link, useFetcher, useRouteLoaderData } from "react-router";
import { toast } from "sonner";
import { Bookmark, BookmarkCheck, ClipboardList, Handshake, Mail, MoreHorizontal, Phone, UserRound } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { withNode } from "~/components/people/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useT } from "~/i18n";
import type { ContactMode } from "~/lib/constants";
import { cn } from "~/lib/utils";

export type ResourcePerson = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  contact_mode: ContactMode;
};

export type ResourceActionsProps = {
  person: ResourcePerson;
  /** Whether the viewer has saved this person. */
  saved: boolean;
  /** Smaller buttons and shorter labels, for result rows and cards. */
  compact?: boolean;
  /** Hide Request Introduction and Track as a request (on a request that is already about this person). */
  hideRequest?: boolean;
  /** Add a "View profile" button, for places where the name is not a link. */
  showProfile?: boolean;
  /** Show the ⋯ menu (Track as a request, Call). Defaults to on for the full size, off for compact. */
  showMenu?: boolean;
  /** "icons": a contact icon plus a ⋯ menu (Call, Save, Track as a request), for dense tables. */
  variant?: "default" | "icons";
  className?: string;
};

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** The link for Request Introduction (the staff request form, with this person filled in). */
export function introRequestHref(personId: string): string {
  return `/app/requests/new?person=${encodeURIComponent(personId)}&intro=1`;
}

/** The link for Track as a request (the request form with this person as the contact of interest). */
export function trackRequestHref(personId: string): string {
  return `/app/requests/new?person=${encodeURIComponent(personId)}`;
}

/** Whether the signed-in viewer is an admin (from the root loader). */
function useIsAdminViewer(): boolean {
  const root = useRouteLoaderData("root") as { user?: { role?: string } | null } | undefined;
  return root?.user?.role === "admin";
}

/** A 40px touch target on phones, the usual size from md up. */
const touch = "max-md:h-10 max-md:min-w-10";

export function ResourceActions({
  person,
  saved,
  compact = false,
  hideRequest = false,
  showProfile = false,
  showMenu,
  variant = "default",
  className,
}: ResourceActionsProps) {
  const { t } = useT();
  const isAdmin = useIsAdminViewer();
  const fetcher = useFetcher<{ ok: boolean; saved?: boolean }>();
  const size = compact ? "sm" : "default";
  const name = person.full_name;

  const hasContact = Boolean(person.email || person.phone);
  // Admins reach anyone they have details for; the introduction setting is for staff.
  const direct = hasContact && (isAdmin || person.contact_mode === "direct");
  const canIntro = !direct && !isAdmin && !hideRequest;
  const canTrack = direct && !hideRequest;
  const extraCall = direct && Boolean(person.email && person.phone);
  const menu = showMenu ?? !compact;

  // Optimistic: show the state being sent, then what the server said.
  const pending = fetcher.formData?.get("intent");
  const isSaved =
    pending === "save" ? true : pending === "unsave" ? false : fetcher.data?.ok ? Boolean(fetcher.data.saved) : saved;
  const failed = fetcher.state === "idle" && fetcher.data && !fetcher.data.ok;
  const toggleSave = () =>
    fetcher.submit({ personId: person.id, intent: isSaved ? "unsave" : "save" }, { method: "post", action: "/app/saved" });

  // One toast per finished save (not on unsave, and not again on re-render).
  const toasted = useRef<unknown>(null);
  useEffect(() => {
    const result = fetcher.state === "idle" ? fetcher.data : undefined;
    if (!result || toasted.current === result) return;
    toasted.current = result;
    if (result.ok && result.saved) {
      toast.success(
        withNode(
          t("resources.actions.savedToast"),
          <Link to="/app/my-connections" className="font-medium underline underline-offset-4">
            {t("resources.actions.myConnections")}
          </Link>,
          "{link}",
        ),
      );
    }
  }, [fetcher.state, fetcher.data, t]);

  const saveLabel = t("resources.actions.saveLabel", { name });
  const contactHref = person.email ? `mailto:${person.email}` : person.phone ? telHref(person.phone) : null;
  const contactLabel = person.email ? t("resources.actions.email", { name }) : t("resources.actions.phone", { name });

  const menuItems = (
    <>
      {extraCall && person.phone && (
        <DropdownMenuItem asChild>
          <a href={telHref(person.phone)}>
            <Phone aria-hidden />
            {t("resources.actions.callShort")}
          </a>
        </DropdownMenuItem>
      )}
      {variant === "icons" && (
        <DropdownMenuCheckboxItem checked={isSaved} onCheckedChange={toggleSave}>
          {isSaved ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
          {isSaved ? t("resources.actions.saved") : t("resources.actions.save")}
        </DropdownMenuCheckboxItem>
      )}
      {canTrack && (
        <DropdownMenuItem asChild>
          <Link to={trackRequestHref(person.id)} aria-label={t("resources.actions.trackLabel", { name })}>
            <ClipboardList aria-hidden />
            {t("resources.actions.track")}
          </Link>
        </DropdownMenuItem>
      )}
    </>
  );
  const hasMenuItems = extraCall || canTrack || variant === "icons";

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact || variant === "icons" ? "icon-sm" : "icon"}
          aria-label={t("resources.actions.more", { name })}
          className={touch}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        {menuItems}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const error = failed ? (
    <span role="status" className="text-xs text-rust-ink">
      {t("resources.actions.saveError")}
    </span>
  ) : null;

  if (variant === "icons") {
    return (
      <div
        role="group"
        aria-label={t("resources.actions.label", { name })}
        className={cn("relative z-10 flex items-center justify-end gap-0.5", className)}
      >
        {direct && contactHref && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon-sm" className={touch}>
                <a href={contactHref} aria-label={contactLabel}>
                  {person.email ? <Mail aria-hidden /> : <Phone aria-hidden />}
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{person.email ?? person.phone}</TooltipContent>
          </Tooltip>
        )}
        {moreMenu}
        {error}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("resources.actions.label", { name })}
      className={cn("relative z-10 flex flex-wrap items-center gap-1", className)}
    >
      {showProfile && (
        <Button asChild variant="outline" size={size} className={touch}>
          <Link to={`/app/people/${person.id}`} prefetch="intent">
            <UserRound aria-hidden data-icon="inline-start" />
            {t("resources.actions.view")}
          </Link>
        </Button>
      )}

      {direct && contactHref && (
        <Button asChild variant="outline" size={size} className={touch}>
          <a href={contactHref} aria-label={contactLabel}>
            {person.email ? <Mail aria-hidden data-icon="inline-start" /> : <Phone aria-hidden data-icon="inline-start" />}
            {t("resources.actions.contact")}
          </a>
        </Button>
      )}

      {canIntro && (
        <Button asChild variant="outline" size={size} className={touch}>
          <Link to={introRequestHref(person.id)}>
            <Handshake aria-hidden data-icon="inline-start" />
            {compact ? t("resources.actions.requestIntroShort") : t("resources.actions.requestIntro")}
          </Link>
        </Button>
      )}

      <fetcher.Form method="post" action="/app/saved" className="contents">
        <input type="hidden" name="personId" value={person.id} />
        {compact ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                name="intent"
                value={isSaved ? "unsave" : "save"}
                variant="ghost"
                size="icon-sm"
                aria-pressed={isSaved}
                aria-label={saveLabel}
                className={cn(touch, isSaved && "text-gold-ink")}
              >
                {isSaved ? <BookmarkCheck aria-hidden className="fill-gold-soft" /> : <Bookmark aria-hidden />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isSaved ? t("resources.actions.saved") : t("resources.actions.save")}</TooltipContent>
          </Tooltip>
        ) : (
          // On the profile the state is spelled out: "Save" or "Saved".
          <Button
            type="submit"
            name="intent"
            value={isSaved ? "unsave" : "save"}
            variant="ghost"
            aria-pressed={isSaved}
            className={cn(touch, isSaved && "text-gold-ink")}
          >
            {isSaved ? (
              <BookmarkCheck aria-hidden data-icon="inline-start" className="fill-gold-soft" />
            ) : (
              <Bookmark aria-hidden data-icon="inline-start" />
            )}
            {isSaved ? t("resources.actions.saved") : t("resources.actions.save")}
          </Button>
        )}
      </fetcher.Form>

      {menu && hasMenuItems && moreMenu}
      {error}
    </div>
  );
}
