import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { ContributionChips, PersonAvatar, StatusBadge, TagList } from "~/components/nva";
import { ChevronRight } from "lucide-react";
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

/** A person in an answer, as one compact row: avatar, name, role, and a way to the profile. */
export function PersonRow({ person, example = false }: { person: AssistantPerson; example?: boolean }) {
  const { t } = useT();
  const role =
    person.title && person.organization_name
      ? t("assistant.roleAt", { title: person.title, org: person.organization_name })
      : person.title || person.organization_name;
  const body = (
    <>
      <PersonAvatar name={person.full_name} className="size-8" />
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-medium text-ink">{person.full_name}</span>
        {role && <span className="truncate text-xs text-smoke">{role}</span>}
      </span>
      <StatusBadge status={person.status} />
      {!example && <ChevronRight className="size-4 shrink-0 text-smoke" aria-hidden="true" />}
    </>
  );
  const box = "flex items-center gap-2.5 rounded-xl border border-stone bg-canvas px-2.5 py-2";
  return example ? (
    <div className={box}>{body}</div>
  ) : (
    <Link
      to={`/app/people/${person.id}`}
      className={`${box} transition-colors hover:border-gold hover:bg-gold-soft/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`}
    >
      {body}
    </Link>
  );
}
