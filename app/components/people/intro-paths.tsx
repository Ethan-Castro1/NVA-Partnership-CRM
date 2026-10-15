/**
 * "How we can reach them": each path from NVA's board or staff to this person,
 * drawn as people joined by small labelled arrows. The inner-circle connector
 * always comes first in a chain, so the first name is who to ask.
 */
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { EmptyState, PersonAvatar, Sheet } from "~/components/nva";
import { useT } from "~/i18n";
import { INNER_CIRCLE } from "~/lib/constants";
import type { IntroPath, MiniPerson } from "~/lib/people.server";

function ChainPerson({ person, isTarget }: { person: MiniPerson; isTarget: boolean }) {
  const { t } = useT();
  const inner = person.affiliations.find((a) => INNER_CIRCLE.includes(a));
  const body = (
    <>
      <PersonAvatar name={person.full_name} className="size-8" />
      <span className="grid min-w-0 leading-tight">
        <span className="truncate text-sm font-medium text-ink">{person.full_name}</span>
        {inner && <span className="text-[0.7rem] text-gold-ink">{t(`common.affiliation.${inner}`)}</span>}
      </span>
    </>
  );
  return isTarget ? (
    <span className="flex max-w-[220px] items-center gap-2">{body}</span>
  ) : (
    <Link
      to={`/app/people/${person.id}`}
      className="flex max-w-[220px] items-center gap-2 rounded-full pr-2 hover:bg-taupe focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {body}
    </Link>
  );
}

export function IntroPaths({ paths, person }: { paths: IntroPath[]; person: MiniPerson }) {
  const { t } = useT();
  const isInner = person.affiliations.some((a) => INNER_CIRCLE.includes(a));

  return (
    <div className="grid gap-3">
      {isInner && (
        <p className="rounded-xl bg-gold-soft px-3.5 py-2.5 text-sm text-graphite">
          {t("people.profile.reachInner", { name: person.full_name })}
        </p>
      )}
      {paths.length === 0 && !isInner && (
        <EmptyState title={t("people.profile.reachEmpty")} body={t("people.profile.reachEmptyBody")} />
      )}
      {paths.length > 0 && (
        <ol className="grid gap-3">
          {paths.map((path, index) => (
            <li key={path.chain.map((p) => p.id).join(">")}>
              <Sheet className="grid gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">
                    <span className="sr-only">{t("people.profile.reachPath", { number: index + 1 })}: </span>
                    {t("people.profile.reachAsk", { name: path.chain[0].full_name })}
                  </p>
                  <span className="rounded-full bg-taupe px-2.5 py-0.5 text-xs text-graphite">
                    {path.degree === 1 ? t("people.profile.reachDirect") : t("people.profile.reachViaOne")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
                  {path.chain.map((member, i) => (
                    <div key={member.id} className="flex flex-wrap items-center gap-2">
                      <ChainPerson person={member} isTarget={i === path.chain.length - 1} />
                      {i < path.edges.length && (
                        <span className="flex items-center gap-1 text-xs text-smoke">
                          <span className="grid leading-tight">
                            <span className="rounded-full border border-stone px-2 py-0.5 text-graphite">
                              {t(`common.relationship.${path.edges[i].kind}`)}
                            </span>
                          </span>
                          <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {path.edges.some((edge) => edge.note) && (
                  <ul className="grid gap-1 border-t border-stone pt-2 text-xs text-smoke">
                    {path.edges.map((edge, i) =>
                      edge.note ? (
                        <li key={i}>
                          <span className="text-graphite">
                            {path.chain[i].full_name}, {path.chain[i + 1].full_name}:
                          </span>{" "}
                          {edge.note}
                        </li>
                      ) : null,
                    )}
                  </ul>
                )}
              </Sheet>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
