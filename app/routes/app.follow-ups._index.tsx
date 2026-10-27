/**
 * /app/follow-ups (admins only): the follow-up to-do list in five views
 * (Overdue, Due today, Upcoming, Awaiting response, Completed), everyone's or
 * mine, with a form to add one. "Today" is the school's date.
 */
import { useState } from "react";
import { useLoaderData } from "react-router";
import { Plus, X } from "lucide-react";
import type { Route } from "./+types/app.follow-ups._index";
import { FollowUpList } from "~/components/crm/follow-up-list";
import { SegmentedLinks } from "~/components/crm/crm-bits";
import { QuickFollowUpForm } from "~/components/crm/quick-follow-up-form";
import { PageHeader, Sheet } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { FOLLOW_UP_VIEWS, type FollowUpView } from "~/lib/constants";
import { schoolToday } from "~/lib/dates";
import { countFollowUps, listFollowUps } from "~/lib/follow-ups.server";
import { getCrmFormOptions } from "~/lib/opportunities.server";
import { requireAdminViewer } from "~/lib/permissions.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("crm.fu.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminViewer(request);
  const params = new URL(request.url).searchParams;
  const requested = params.get("view");
  const mine = params.get("show") === "mine";
  const today = schoolToday();
  const ownerUserId = mine ? user.id : undefined;
  const counts = await countFollowUps(user, { ownerUserId, today });
  // Default view: overdue when anything is, else due today, else upcoming.
  const view: FollowUpView = (FOLLOW_UP_VIEWS as readonly string[]).includes(requested ?? "")
    ? (requested as FollowUpView)
    : counts.overdue
      ? "overdue"
      : counts.today
        ? "today"
        : "upcoming";
  const [items, options] = await Promise.all([
    listFollowUps(user, { views: view, ownerUserId, today, limit: view === "completed" ? 100 : 300 }),
    getCrmFormOptions(user),
  ]);
  return { today, view, mine, counts, items, people: options.people, owners: options.owners, userId: user.id };
}

const VIEW_ORDER: FollowUpView[] = ["overdue", "today", "upcoming", "awaiting", "completed"];

function url(view: FollowUpView, mine: boolean) {
  const params = new URLSearchParams({ view });
  if (mine) params.set("show", "mine");
  return `/app/follow-ups?${params}`;
}

export default function FollowUps() {
  const { today, view, mine, counts, items, people, owners, userId } = useLoaderData<typeof loader>();
  const { t } = useT();
  const [adding, setAdding] = useState(false);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow={t("crm.eyebrow")}
        title={t("crm.fu.title")}
        description={t("crm.fu.description")}
        actions={
          adding ? (
            <Button variant="outline" size="lg" onClick={() => setAdding(false)}>
              <X aria-hidden="true" />
              {t("crm.fu.action.close")}
            </Button>
          ) : (
            <Button variant="brand" size="lg" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" />
              {t("crm.fu.new")}
            </Button>
          )
        }
      />

      {adding && (
        <Sheet className="p-6">
          <h2 className="text-section mb-4">{t("crm.fu.form.title")}</h2>
          <QuickFollowUpForm today={today} people={people} owners={owners} defaultOwnerId={userId} />
        </Sheet>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedLinks
          label={t("crm.fu.views")}
          tabs={VIEW_ORDER.map((v) => ({
            to: url(v, mine),
            label: t(`common.followUpView.${v}`),
            current: v === view,
            count: v === "completed" ? undefined : counts[v],
          }))}
        />
        <SegmentedLinks
          label={t("crm.filter.whose")}
          tabs={[
            { to: url(view, false), label: t("crm.filter.everyone"), current: !mine },
            { to: url(view, true), label: t("crm.filter.mine"), current: mine },
          ]}
        />
      </div>

      <Sheet className="px-5 py-2">
        <FollowUpList items={items} today={today} empty={t(`crm.fu.empty.${view}`)} />
      </Sheet>
    </div>
  );
}
