/**
 * A person's opportunities, for the admin side of a profile: open ones with
 * their stage, then the closed ones, and a link to add another.
 * Admin only: render it only when the loader returned getPersonCrm() data.
 *
 * Props:
 * - personId: the person (the "New opportunity" link pre-fills them).
 * - opportunities: PersonCrm.opportunities from getPersonCrm(viewer, personId)
 *   (or listOpportunities(viewer, { personId, state: "all" })).
 * - today: schoolToday(), for date labels (optional).
 * - className
 */
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import type { OpportunityView } from "~/lib/opportunities.server";
import { cn } from "~/lib/utils";
import { StageBadge, crmDate } from "./crm-bits";

export type OpportunitiesPanelProps = {
  personId: string;
  opportunities: OpportunityView[];
  today?: string;
  className?: string;
};

export function OpportunitiesPanel({ personId, opportunities, today, className }: OpportunitiesPanelProps) {
  const { t } = useT();
  const open = opportunities.filter((o) => o.open);
  const closed = opportunities.filter((o) => !o.open);
  return (
    <Panel
      title={t("crm.opps.panel.title")}
      className={className}
      action={
        <Button asChild variant="outline" size="sm">
          <Link to={`/app/opportunities/new?person=${encodeURIComponent(personId)}`}>
            <Plus aria-hidden="true" />
            {t("crm.opps.panel.add")}
          </Link>
        </Button>
      }
    >
      {opportunities.length === 0 ? (
        <p className="py-3 text-sm text-smoke">{t("crm.opps.panel.empty")}</p>
      ) : (
        <div className="grid gap-4">
          {open.length > 0 && <OpportunityRows items={open} today={today} />}
          {closed.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-medium tracking-wide text-smoke uppercase">{t("crm.opps.panel.closed")}</h3>
              <OpportunityRows items={closed} today={today} muted />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Compact opportunity rows: title link, track and kind, stage, and the next date. Also used on the list page. */
export function OpportunityRows({
  items,
  today,
  muted,
  showPerson,
}: {
  items: OpportunityView[];
  today?: string;
  muted?: boolean;
  showPerson?: boolean;
}) {
  const { t, locale } = useT();
  return (
    <ul className="divide-y divide-stone">
      {items.map((o) => (
        <li key={o.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
          <div className="min-w-0 flex-1">
            <Link
              to={`/app/opportunities/${o.id}`}
              className={cn("font-medium underline-offset-4 hover:underline", muted ? "text-graphite" : "text-ink")}
            >
              {o.title}
            </Link>
            <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-smoke">
              {showPerson &&
                (o.person_id ? (
                  <Link to={`/app/people/${o.person_id}`} className="text-graphite underline-offset-4 hover:text-ink hover:underline">
                    {o.person_name}
                    {o.organization_name && <span className="text-smoke">, {o.organization_name}</span>}
                  </Link>
                ) : (
                  <span>{t("crm.opps.row.noPerson")}</span>
                ))}
              <span>
                {t(`common.track.${o.track}`)} · {t(`common.opportunityKind.${o.kind}`)}
              </span>
              {o.amount && <span>{o.amount}</span>}
              {o.owner_name && showPerson && <span>{o.owner_name}</span>}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-smoke">
            <StageBadge stage={o.stage} />
            {o.open && o.next_follow_up_on ? (
              <span className={cn(today && o.next_follow_up_on < today && "font-medium text-rust-ink")}>
                {t("crm.opps.row.nextFollowUp", { date: crmDate(o.next_follow_up_on, locale, today) })}
              </span>
            ) : (
              o.target_date && <span>{t("crm.opps.row.target", { date: crmDate(o.target_date, locale, today) })}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
