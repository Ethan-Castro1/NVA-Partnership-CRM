import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { ContributionChips, PersonAvatar, StatusBadge, TagList } from "~/components/nva";
import { useT } from "~/i18n";
import type { AssistantPerson } from "./types";

/** A person the assistant mentioned: who they are, how they can help, and a way to their profile. */
export function PersonCard({ person, example = false }: { person: AssistantPerson; example?: boolean }) {
  const { t } = useT();
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
        <StatusBadge status={person.status} />
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
