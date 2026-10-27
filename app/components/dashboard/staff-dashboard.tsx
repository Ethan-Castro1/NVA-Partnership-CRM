/** The staff dashboard: Search, Connect, Arrange. No CRM pipelines, notes or inboxes. */
import { Handshake, Search, CalendarCheck } from "lucide-react";
import { Panel } from "~/components/nva";
import { MyRequestsList } from "~/components/requests";
import { useT } from "~/i18n";
import type { StaffDashboard as StaffData } from "~/lib/dashboard.server";
import { MyCaps, NeedSearch, ResourceList, UpcomingEngagements, ViewAll } from "./panels";

export function StaffDashboard({ data, firstName, todayLabel }: { data: StaffData; firstName: string; todayLabel: string }) {
  const { t } = useT();
  const steps = [
    { icon: <Search />, title: t("dashboard.steps.search"), body: t("dashboard.steps.searchBody") },
    { icon: <Handshake />, title: t("dashboard.steps.connect"), body: t("dashboard.steps.connectBody") },
    { icon: <CalendarCheck />, title: t("dashboard.steps.arrange"), body: t("dashboard.steps.arrangeBody") },
  ];

  return (
    <div className="grid gap-6 md:gap-8">
      <div className="grid gap-2">
        <p className="text-eyebrow text-gold-ink">{todayLabel}</p>
        <p className="text-sm text-smoke">{t("dashboard.greeting", { name: firstName })}</p>
      </div>

      <div className="grid gap-3">
        <h1 className="sr-only">{t("dashboard.title")}</h1>
        <NeedSearch prominent brand />
        <ol aria-label={t("dashboard.steps.label")} className="grid gap-2 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="flex items-start gap-3 rounded-2xl px-1 py-2">
              <span
                className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-soft text-gold-ink [&_svg]:size-4"
                aria-hidden="true"
              >
                {step.icon}
              </span>
              <span className="grid text-sm">
                <span className="font-semibold text-ink">
                  {i + 1}. {step.title}
                </span>
                <span className="text-smoke">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid min-w-0 gap-6">
          <MyRequestsList requests={data.myRequests} />
          <UpcomingEngagements items={data.engagements} />
          <MyCaps caps={data.caps} />
        </div>
        <div className="grid min-w-0 gap-6">
          <Panel title={t("dashboard.recent.title")} action={<ViewAll to="/app/people" />}>
            <ResourceList people={data.recent} empty={t("dashboard.recent.empty")} />
          </Panel>
          <Panel title={t("dashboard.saved.title")} action={data.saved.length > 0 && <ViewAll to="/app/my-connections" />}>
            <ResourceList people={data.saved.map((p) => ({ ...p, saved: true }))} empty={t("dashboard.saved.empty")} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
