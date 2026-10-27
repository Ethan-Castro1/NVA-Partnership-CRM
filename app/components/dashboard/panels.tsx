/** Pieces both dashboards use: the search box, CAP cards, resource rows and confirmed engagements. */
import { Form, Link } from "react-router";
import { ArrowRight, CalendarCheck, Search } from "lucide-react";
import { Panel, PersonAvatar } from "~/components/nva";
import { requestWhen } from "~/components/requests";
import { ResourceActions, type ResourcePerson } from "~/components/resources/resource-actions";
import { Button } from "~/components/ui/button";
import { useT, type MessageKey } from "~/i18n";
import type { CapStatus } from "~/lib/constants";
import { cn } from "~/lib/utils";

export const linkClass =
  "rounded-sm font-medium text-ink hover:underline hover:decoration-gold hover:decoration-2 hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

/** On phones, a dashboard list shows its first three rows; "View all" has the rest. */
export const MOBILE_LIMIT = "max-sm:[&>li:nth-child(n+4)]:hidden";

export function ViewAll({ to, label }: { to: string; label?: string }) {
  const { t } = useT();
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={to}>
        {label ?? t("dashboard.viewAll")}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}

// ---------- search ----------

const EXAMPLES = ["carpentry", "healthcare", "event", "environment", "internships"] as const;

/** The staff hero: "What do you need help with?" Submits to /app/people?q=; the examples are one-click searches. */
export function NeedSearch() {
  const { t } = useT();
  const inputId = "need-search";
  return (
    <section aria-labelledby={`${inputId}-label`} className="rounded-card bg-canvas p-5 shadow-whisper md:p-8">
      <Form method="get" action="/app/people" role="search" className="grid gap-3">
        <label id={`${inputId}-label`} htmlFor={inputId} className="text-heading">
          {t("dashboard.search.title")}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-smoke" aria-hidden="true" />
            <input
              id={inputId}
              name="q"
              type="search"
              required
              maxLength={200}
              placeholder={t("dashboard.search.placeholder")}
              className="h-14 w-full rounded-full border border-stone bg-taupe pr-4 pl-12 text-base outline-none placeholder:text-smoke focus-visible:border-gold focus-visible:bg-canvas focus-visible:ring-3 focus-visible:ring-ring/40"
            />
          </div>
          <Button type="submit" variant="brand" size="lg" className="h-14">
            {t("dashboard.search.button")}
          </Button>
        </div>
      </Form>
      <div className="mt-4 grid gap-2">
        <p className="text-xs text-smoke">{t("dashboard.examplesLabel")}</p>
        <ul className="flex flex-wrap gap-2">
          {EXAMPLES.map((key) => {
            const text = t(`dashboard.search.example.${key}` as MessageKey);
            return (
              <li key={key}>
                <Link
                  to={`/app/people?q=${encodeURIComponent(text)}`}
                  className="inline-flex min-h-10 items-center rounded-full border border-stone bg-canvas px-3 py-1 text-left text-sm text-graphite transition-colors hover:border-gold hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {text}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ---------- CAPs ----------

const CAP_STATUS_STYLE: Record<CapStatus, string> = {
  planning: "bg-gold-soft text-gold-ink",
  active: "bg-sage-soft text-sage-ink",
  complete: "bg-stone text-smoke",
};

export function CapStatusPill({ status }: { status: CapStatus }) {
  const { t } = useT();
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[0.7rem] font-medium", CAP_STATUS_STYLE[status])}>
      {t(`common.capStatus.${status}`)}
    </span>
  );
}

export type DashboardCap = {
  id: string;
  title: string;
  status: CapStatus;
  term: string | null;
  topics: string[];
  partner_count: number;
  confirmed_count: number;
};

/** The viewer's CAPs; nothing at all when they have none. */
export function MyCaps({ caps }: { caps: DashboardCap[] }) {
  const { t } = useT();
  if (caps.length === 0) return null;
  return (
    <Panel title={t("dashboard.myCaps")} action={<ViewAll to="/app/caps" />}>
      <ul className={cn("grid gap-2", MOBILE_LIMIT)}>
        {caps.map((cap) => (
          <li key={cap.id} className="rounded-2xl border border-stone bg-canvas p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link to={`/app/caps/${cap.id}`} className={cn(linkClass, "min-w-0 flex-1")}>
                {cap.title}
              </Link>
              <CapStatusPill status={cap.status} />
            </div>
            <p className="mt-1 text-sm text-smoke">
              {cap.topics.length ? cap.topics.slice(0, 3).join(", ") : t("dashboard.capNoTopics")}
              {cap.term ? ` (${cap.term})` : ""}
            </p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-graphite">
              <span>{t("dashboard.capPartners", { count: cap.partner_count })}</span>
              <span>{t("dashboard.capConfirmed", { count: cap.confirmed_count })}</span>
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------- resources ----------

export type ResourceRow = ResourcePerson & {
  title: string | null;
  organization_name: string | null;
  skills: string[];
  saved: boolean;
};

/** People as compact rows: name (links to the profile), their role, then Contact or Request intro and Save. */
export function ResourceList({ people, empty }: { people: ResourceRow[]; empty?: string }) {
  if (!people.length) return empty ? <p className="py-2 text-sm text-smoke">{empty}</p> : null;
  return (
    <ul className={cn("divide-y divide-stone", MOBILE_LIMIT)}>
      {people.map((p) => {
        const role = [p.title, p.organization_name].filter(Boolean).join(", ");
        return (
          <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <PersonAvatar name={p.full_name} className="size-9" />
            <div className="min-w-0 flex-1">
              <Link to={`/app/people/${p.id}`} className={linkClass}>
                {p.full_name}
              </Link>
              {role && <p className="truncate text-xs text-smoke">{role}</p>}
            </div>
            <ResourceActions person={p} saved={p.saved} compact className="shrink-0 flex-nowrap" />
          </li>
        );
      })}
    </ul>
  );
}

// ---------- confirmed engagements ----------

export type EngagementRow = {
  id: string;
  need: string;
  status: "open" | "arranged" | "completed" | "canceled";
  preferred_date: string | null;
  timeframe: string | null;
  requester_name: string;
  cap_title: string | null;
  people: { id: string; full_name: string }[];
};

/** Arranged staff requests with a date ahead (listUpcomingArranged). All are arranged, so no status badge. */
export function UpcomingEngagements({
  items,
  showRequester = false,
  hideWhenEmpty = false,
  className,
}: {
  items: EngagementRow[];
  showRequester?: boolean;
  hideWhenEmpty?: boolean;
  className?: string;
}) {
  const { t, locale } = useT();
  if (hideWhenEmpty && items.length === 0) return null;
  return (
    <Panel title={t("dashboard.engagements.title")} className={className}>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-smoke">{t("dashboard.engagements.empty")}</p>
      ) : (
        <ul className={cn("divide-y divide-stone", MOBILE_LIMIT)}>
          {items.map((r) => {
            const names = r.people.map((p) => p.full_name).join(", ");
            return (
              <li key={r.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-blue-soft text-blue-ink" aria-hidden="true">
                  <CalendarCheck className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={`/app/requests/${r.id}`} className={linkClass}>
                    {r.need}
                  </Link>
                  <p className="flex flex-wrap gap-x-3 text-xs text-smoke">
                    <span className="font-medium text-graphite">{requestWhen(r, locale)}</span>
                    {names && <span>{t("requests.item.with", { names })}</span>}
                    {showRequester && <span>{t("dashboard.engagements.from", { name: r.requester_name })}</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
