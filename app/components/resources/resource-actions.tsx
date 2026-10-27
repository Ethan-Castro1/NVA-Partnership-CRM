/**
 * The four things staff can do with a search result: View Profile, Contact,
 * Request Introduction and Save. Contact shows only for direct-contact people
 * whose email or phone the viewer received; otherwise Request Introduction
 * shows. Save posts to /app/saved, which checks the viewer can see the person.
 *
 *   <ResourceActions person={hit} saved={savedIds.has(hit.id)} compact />
 */
import { Link, useFetcher } from "react-router";
import { Bookmark, BookmarkCheck, Handshake, Mail, Phone, UserRound } from "lucide-react";
import { Button } from "~/components/ui/button";
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
  className?: string;
};

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** The link for Request Introduction (the staff request form, with this person filled in). */
export function introRequestHref(personId: string): string {
  return `/app/requests/new?person=${encodeURIComponent(personId)}&intro=1`;
}

export function ResourceActions({ person, saved, compact = false, className }: ResourceActionsProps) {
  const { t } = useT();
  const fetcher = useFetcher<{ ok: boolean; saved?: boolean }>();
  const size = compact ? "xs" : "sm";
  const name = person.full_name;

  const direct = person.contact_mode === "direct" && Boolean(person.email || person.phone);
  // Optimistic: show the state being sent, then what the server said.
  const pending = fetcher.formData?.get("intent");
  const isSaved =
    pending === "save" ? true : pending === "unsave" ? false : fetcher.data?.ok ? Boolean(fetcher.data.saved) : saved;
  const failed = fetcher.state === "idle" && fetcher.data && !fetcher.data.ok;

  return (
    <div
      role="group"
      aria-label={t("resources.actions.label", { name })}
      className={cn("relative z-10 flex flex-wrap items-center gap-1.5", className)}
    >
      <Button asChild variant="outline" size={size}>
        <Link to={`/app/people/${person.id}`} prefetch="intent">
          <UserRound aria-hidden data-icon="inline-start" />
          {t("resources.actions.view")}
        </Link>
      </Button>

      {direct && person.email && (
        <Button asChild variant="outline" size={size}>
          <a href={`mailto:${person.email}`} aria-label={t("resources.actions.email", { name })}>
            <Mail aria-hidden data-icon="inline-start" />
            {t("resources.actions.contact")}
          </a>
        </Button>
      )}
      {direct && person.phone && (!person.email || !compact) && (
        <Button asChild variant="outline" size={size}>
          <a href={telHref(person.phone)} aria-label={person.email ? t("resources.actions.call", { name }) : t("resources.actions.phone", { name })}>
            <Phone aria-hidden data-icon="inline-start" />
            {person.email ? t("resources.actions.callShort") : t("resources.actions.contact")}
          </a>
        </Button>
      )}

      {!direct && (
        <Button asChild variant="outline" size={size}>
          <Link to={introRequestHref(person.id)}>
            <Handshake aria-hidden data-icon="inline-start" />
            {compact ? t("resources.actions.requestIntroShort") : t("resources.actions.requestIntro")}
          </Link>
        </Button>
      )}

      <fetcher.Form method="post" action="/app/saved">
        <input type="hidden" name="personId" value={person.id} />
        <Button
          type="submit"
          name="intent"
          value={isSaved ? "unsave" : "save"}
          variant={isSaved ? "secondary" : "ghost"}
          size={size}
          aria-pressed={isSaved}
          aria-label={t("resources.actions.saveLabel", { name })}
        >
          {isSaved ? <BookmarkCheck aria-hidden data-icon="inline-start" /> : <Bookmark aria-hidden data-icon="inline-start" />}
          {isSaved ? t("resources.actions.saved") : t("resources.actions.save")}
        </Button>
      </fetcher.Form>
      {failed && (
        <span role="status" className="text-xs text-rust-ink">
          {t("resources.actions.saveError")}
        </span>
      )}
    </div>
  );
}
