/** One need-search match: who they are, why they matched, and how to reach them. */
import { Link } from "react-router";
import { CircleDashed, MessageCircle } from "lucide-react";
import { ContributionChips, PersonAvatar, Sheet, StatusBadge, TagList } from "~/components/nva";
import { useT } from "~/i18n";
import type { ConnectorResult } from "~/lib/connections.server";
import { PathChain } from "./path-chain";

const VISIBLE_PATHS = 2;

export function ConnectorCard({ result }: { result: ConnectorResult }) {
  const { t, tx } = useT();
  const { person, direct, paths } = result;
  // Matched CAP topics are stored as English keys; suggested ones have translated labels.
  const matched = person.matched.map((tag) => tx(`caps.topic.${tag}`, tag));
  const subtitle = [person.title, person.organization_name].filter(Boolean).join(", ");
  const shown = paths.slice(0, VISIBLE_PATHS);
  const more = paths.slice(VISIBLE_PATHS);

  return (
    <Sheet className="grid gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <PersonAvatar name={person.full_name} className="size-10" />
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 font-sans text-base font-bold tracking-normal">
            <Link
              to={`/app/people/${person.id}`}
              className="underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {person.full_name}
            </Link>
            <StatusBadge status={person.status} />
          </h3>
          {subtitle && <p className="text-sm text-smoke">{subtitle}</p>}
        </div>
        {direct && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 text-xs font-bold text-ink">
            <MessageCircle className="size-3.5" aria-hidden="true" />
            {t("connections.results.askDirectly")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ContributionChips types={person.contribution_types} />
        {matched.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-smoke">{t("connections.results.matched")}:</span>
            <TagList tags={matched} highlight={matched} />
          </div>
        )}
      </div>

      {direct ? (
        <p className="text-sm text-smoke">{t("connections.results.askDirectlyHelp")}</p>
      ) : paths.length ? (
        <div className="grid gap-3 border-t border-stone pt-4">
          <p className="sr-only">{t("connections.results.pathsLabel", { name: person.full_name })}</p>
          {shown.map((path) => (
            <PathRow key={path.chain.map((p) => p.id).join(">")} path={path} />
          ))}
          {more.length > 0 && (
            <details className="group">
              <summary className="w-fit cursor-pointer rounded-full text-sm font-medium text-graphite underline decoration-gold decoration-2 underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                {t("connections.results.morePaths", { count: more.length })}
              </summary>
              <div className="mt-3 grid gap-3">
                {more.map((path) => (
                  <PathRow key={path.chain.map((p) => p.id).join(">")} path={path} />
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-2 border-t border-stone pt-4 text-sm text-smoke">
          <CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-medium text-graphite">{t("connections.results.noPath")}.</span>{" "}
            {t("connections.results.noPathHelp")}
          </p>
        </div>
      )}
    </Sheet>
  );
}

function PathRow({ path }: { path: ConnectorResult["paths"][number] }) {
  const { t } = useT();
  return (
    <div className="grid gap-1.5">
      <p className="text-eyebrow text-smoke">
        {path.degree === 1 ? t("connections.results.degree1") : t("connections.results.degree2")}
      </p>
      <PathChain path={path} />
    </div>
  );
}
