/**
 * A person's follow-ups, for the admin side of a profile: open ones (overdue
 * first), the last few done, and an "Add follow-up" form that opens in place.
 * Admin only: render it only when the loader returned getPersonCrm() data.
 *
 * Props:
 * - personId: the person.
 * - followUps: PersonCrm.followUps from getPersonCrm(viewer, personId).
 * - today: PersonCrm.today.
 * - opportunities: the person's opportunities (PersonCrm.opportunities), so a new follow-up can link to an open one.
 * - owners: PersonCrm.owners (admins to assign to).
 * - className
 */
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import type { FollowUpItem } from "~/lib/follow-ups.server";
import type { NamedOption, OpportunityView } from "~/lib/opportunities.server";
import { FollowUpList } from "./follow-up-list";
import { QuickFollowUpForm } from "./quick-follow-up-form";

export type FollowUpsPanelProps = {
  personId: string;
  followUps: FollowUpItem[];
  today: string;
  opportunities?: Pick<OpportunityView, "id" | "title" | "open">[];
  owners?: NamedOption[];
  className?: string;
};

export function FollowUpsPanel({ personId, followUps, today, opportunities = [], owners, className }: FollowUpsPanelProps) {
  const { t } = useT();
  const [adding, setAdding] = useState(false);
  const open = followUps.filter((f) => f.status === "open");
  const done = followUps.filter((f) => f.status === "completed");

  return (
    <Panel
      title={t("crm.fu.panel.title")}
      className={className}
      action={
        <Button variant="outline" size="sm" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
          {adding ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {adding ? t("crm.fu.action.close") : t("crm.fu.panel.add")}
        </Button>
      }
    >
      {adding && (
        <div className="mb-4 rounded-card bg-canvas p-4 shadow-whisper">
          <QuickFollowUpForm
            today={today}
            personId={personId}
            opportunities={opportunities.filter((o) => o.open).map((o) => ({ id: o.id, title: o.title }))}
            owners={owners}
            onDone={() => setAdding(false)}
          />
        </div>
      )}
      <FollowUpList items={[...open, ...done]} today={today} showPerson={false} empty={t("crm.fu.panel.empty")} />
    </Panel>
  );
}
