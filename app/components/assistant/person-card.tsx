import { Link, useRouteLoaderData } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { ContributionChips, PersonAvatar, StatusBadge, TagList } from "~/components/nva";
import { MatchReasons } from "~/components/resources/match-reasons";
import { ResourceActions } from "~/components/resources/resource-actions";
import { useT } from "~/i18n";
import type { AssistantPerson } from "./types";

/** Relationship status is CRM data; only admins see it. */
function useShowStatus(): boolean {
  const root = useRouteLoaderData("root") as { user?: { role?: string } | null } | undefined;
  return root?.user?.role === "admin";
}

/** A person the assistant mentioned: who they are, how they can help, and a way to their profile. */
export function PersonCard({ person, example = false }: { person: AssistantPerson; example?: boolean }) {
  const { t } = useT();
  const showStatus = useShowStatus();
  const role =
    person.title && person.organization_name
      ? t("assistant.roleAt", { title: person.title, org: person.organization_name })
      : person.title || person.organization_name;
  return (
    <article className="flex h-full flex-col gap-3 rounded-card border border-stone bg-canvas p-4">
      <div className="flex items-start gap-3">
        <PersonAvatar name={person.full_name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-ink">{person.full_name}</h3>
          {role && <p className="truncate text-sm text-smoke">{role}</p>}
        </div>
        {showStatus && <StatusBadge status={person.status} />}
      </div>
      <ContributionChips types={person.contribution_types} />
      <TagList tags={person.skills} max={4} />
      {!example && (
      <Link
        to={`/app/people/${person.id}`}
        className="mt-auto inline-flex w-fit items-center gap-1 rounded-full text-sm font-medium text-ink underline decoration-gold decoration-2 underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {t("assistant.viewProfile")}
        <span className="sr-only">: {person.full_name}</span>
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Link>
      )}
    </article>
  );
}

/**
 * A person in an answer, as one compact block: avatar, name and role, why they
 * matched, then View Profile, Contact or Request Introduction (by contact
 * mode) and Save. Example cards are inert.
 */
export function PersonRow({ person, example = false }: { person: AssistantPerson; example?: boolean }) {
  const { t } = useT();
  const showStatus = useShowStatus();
  const role =
    person.title && person.organization_name
      ? t("assistant.roleAt", { title: person.title, org: person.organization_name })
      : person.title || person.organization_name;
  return (
    <div className="grid gap-2 rounded-xl border border-stone bg-canvas px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={person.full_name} className="size-8" />
        <span className="grid min-w-0 flex-1 leading-tight">
          {example ? (
            <span className="truncate text-sm font-medium text-ink">{person.full_name}</span>
          ) : (
            <Link
              to={`/app/people/${person.id}`}
              className="truncate rounded-sm text-sm font-medium text-ink underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {person.full_name}
            </Link>
          )}
          {role && <span className="truncate text-xs text-smoke">{role}</span>}
        </span>
        {showStatus && <StatusBadge status={person.status} />}
      </div>
      <MatchReasons reasons={person.reasons} max={2} />
      {!example && (
        <ResourceActions
          person={{
            id: person.id,
            full_name: person.full_name,
            email: person.email ?? null,
            phone: person.phone ?? null,
            contact_mode: person.contact_mode ?? "introduction",
          }}
          saved={person.saved ?? false}
          compact
        />
      )}
    </div>
  );
}
