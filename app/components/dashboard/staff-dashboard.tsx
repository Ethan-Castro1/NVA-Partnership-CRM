/** The staff dashboard: search first, then their requests, engagements, CAPs and people. No CRM pipelines, notes or inboxes. */
import { Panel } from "~/components/nva";
import { MyRequestsList } from "~/components/requests";
import { useT } from "~/i18n";
import type { StaffDashboard as StaffData } from "~/lib/dashboard.server";
import { MyCaps, NeedSearch, ResourceList, UpcomingEngagements, ViewAll } from "./panels";

export function StaffDashboard({ data, firstName, todayLabel }: { data: StaffData; firstName: string; todayLabel: string }) {
  const { t } = useT();

  return (
    <div className="grid gap-6 md:gap-8">
      <div className="grid gap-1">
        <p className="text-eyebrow text-gold-ink">{todayLabel}</p>
        <p className="text-sm text-smoke">{t("dashboard.greeting", { name: firstName })}</p>
      </div>

      <NeedSearch />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid min-w-0 gap-6">
          <MyRequestsList requests={data.myRequests} className="max-sm:[&_ul>li:nth-child(n+4)]:hidden" />
          <UpcomingEngagements items={data.engagements} hideWhenEmpty />
          <MyCaps caps={data.caps} />
        </div>
        <div className="grid min-w-0 gap-6">
          <Panel title={t("dashboard.recent.title")} action={<ViewAll to="/app/people" />} className="min-w-0">
            <ResourceList people={data.recent} empty={t("dashboard.recent.empty")} />
          </Panel>
          {data.saved.length > 0 && (
            <Panel title={t("dashboard.saved.title")} action={<ViewAll to="/app/my-connections" />} className="min-w-0">
              <ResourceList people={data.saved.map((p) => ({ ...p, saved: true }))} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
