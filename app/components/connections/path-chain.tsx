/**
 * One intro path drawn as a horizontal chain:
 * connector (board/staff) → relationship → middle person → relationship → target.
 * Wraps onto several lines on narrow screens; the list order reads naturally
 * to screen readers ("Rosa, Board member, Knows, Lucía, Colleague, Mei").
 */
import { Fragment } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { PersonAvatar } from "~/components/nva";
import { useT } from "~/i18n";
import { INNER_CIRCLE } from "~/lib/constants";
import type { IntroPath, MiniPerson } from "~/lib/people.server";
import { cn } from "~/lib/utils";

function PersonStep({ person, role }: { person: MiniPerson; role: "connector" | "middle" | "target" }) {
  const { t } = useT();
  const inner = person.affiliations.find((a) => INNER_CIRCLE.includes(a));
  return (
    <Link
      to={`/app/people/${person.id}`}
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        role === "connector" ? "border-gold bg-gold-soft hover:bg-[#ffe9ad]" : "border-stone bg-canvas hover:bg-taupe",
        role === "target" && "font-medium",
      )}
    >
      <PersonAvatar name={person.full_name} className="size-6 text-[0.6rem]" />
      <span className="truncate">{person.full_name}</span>
      {role === "connector" && inner && (
        <span className="rounded-full bg-canvas px-1.5 text-[0.65rem] font-medium whitespace-nowrap text-gold-ink">
          {t(`common.affiliation.${inner}`)}
        </span>
      )}
    </Link>
  );
}

export function PathChain({ path, className }: { path: IntroPath; className?: string }) {
  const { t } = useT();
  return (
    <ol className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-2", className)}>
      {path.chain.map((person, i) => (
        <Fragment key={`${person.id}-${i}`}>
          {i > 0 && (
            <li className="flex items-center gap-1 text-xs text-smoke">
              <ArrowRight className="size-3.5 text-ash" aria-hidden="true" />
              <span className="grid leading-tight" title={path.edges[i - 1]?.note ?? undefined}>
                <span className="font-medium text-graphite">{t(`common.relationship.${path.edges[i - 1].kind}`)}</span>
                {path.edges[i - 1]?.note && <span className="max-w-[14rem] truncate">{path.edges[i - 1].note}</span>}
              </span>
              <ArrowRight className="size-3.5 text-ash" aria-hidden="true" />
            </li>
          )}
          <li className="min-w-0">
            <PersonStep person={person} role={i === 0 ? "connector" : i === path.chain.length - 1 ? "target" : "middle"} />
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

/** "Rosa (Knows) Lucía (Colleague) Mei": a path as plain text, for lists and screen readers. */
export function pathText(path: IntroPath, t: ReturnType<typeof useT>["t"]): string {
  let out = path.chain[0].full_name;
  for (let i = 1; i < path.chain.length; i++) {
    out = t("connections.results.pathText", {
      from: out,
      relationship: t(`common.relationship.${path.edges[i - 1].kind}`).toLowerCase(),
      to: path.chain[i].full_name,
    });
  }
  return out;
}
