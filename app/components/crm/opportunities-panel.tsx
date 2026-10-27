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
import { StageBadge, crmDate, useMyId } from "./crm-bits";

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

/** Compact opportunity rows (two lines): title and stage, then who, kind and the next date. Also used on the list page. */
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
  const me = useMyId();
  return (
    <ul className="divide-y divide-stone">
      {items.map((o) => {
        const overdue = !!(today && o.open && o.next_follow_up_on && o.next_follow_up_on < today);
        const date =
          o.open && o.next_follow_up_on
            ? t("crm.opps.row.nextFollowUp", { date: crmDate(o.next_follow_up_on, locale, today) })
            : o.target_date
              ? t("crm.opps.row.target", { date: crmDate(o.target_date, locale, today) })
              : null;
        const meta = [
          t(`common.opportunityKind.${o.kind}`),
          o.amount,
          showPerson && o.owner_name && o.owner_user_id !== me ? o.owner_name : null,
        ].filter(Boolean);
        return (
          <li key={o.id} className="grid grid-cols-[minmax(0,1fr)] gap-0.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <Link
                to={`/app/opportunities/${o.id}`}
                className={cn("min-w-0 font-medium underline-offset-4 hover:underline", muted ? "text-graphite" : "text-ink")}
              >
                {o.title}
              </Link>
              <StageBadge stage={o.stage} className="shrink-0" />
            </div>
            <div className="flex items-baseline justify-between gap-3 text-xs text-smoke">
              <p className="min-w-0 truncate">
                {showPerson &&
                  (o.person_id ? (
                    <Link to={`/app/people/${o.person_id}`} className="text-graphite underline-offset-4 hover:text-ink hover:underline">
                      {o.person_name}
                      {o.organization_name && <span className="text-smoke">, {o.organization_name}</span>}
                    </Link>
                  ) : (
                    <span>{t("crm.opps.row.noPerson")}</span>
                  ))}
                {showPerson && meta.length > 0 && " · "}
                {meta.join(" · ")}
              </p>
              {date && <span className={cn("shrink-0", overdue && "font-medium text-rust-ink")}>{date}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
