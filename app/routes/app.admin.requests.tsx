/** Staff Requests (admin): every request, open ones first, introductions on top. */
import type { Route } from "./+types/app.admin.requests";
import { SegmentedLinks } from "~/components/crm/crm-bits";
import { PageHeader, Sheet } from "~/components/nva";
import { RequestRows } from "~/components/requests";
import { makeT, useT } from "~/i18n";
import { requireAdmin } from "~/lib/auth.server";
import type { RequestStatus } from "~/lib/constants";
import { listRequests } from "~/lib/requests.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("requests.list.title")} | ${t("common.schoolName")}` }];
};

type Tab = RequestStatus | "all";
const TABS: Tab[] = ["open", "arranged", "completed", "canceled", "all"];

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  const param = new URL(request.url).searchParams.get("status");
  const tab: Tab = TABS.includes(param as Tab) ? (param as Tab) : "open";
  const all = await listRequests(admin, { limit: 500 });
  const counts = Object.fromEntries(TABS.map((s) => [s, s === "all" ? all.length : all.filter((r) => r.status === s).length])) as Record<Tab, number>;
  let requests = tab === "all" ? all : all.filter((r) => r.status === tab);
  // Introductions first among open ones; otherwise the list order (newest first).
  if (tab === "open") requests = [...requests].sort((a, b) => Number(b.kind === "introduction") - Number(a.kind === "introduction"));
  return { tab, counts, requests };
}

export default function AdminRequests({ loaderData }: Route.ComponentProps) {
  const { t } = useT();
  const { tab, counts, requests } = loaderData;
  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={t("requests.list.title")} />

      <SegmentedLinks
        label={t("requests.list.tabs")}
        tabs={TABS.map((s) => ({ to: s === "open" ? "?" : `?status=${s}`, label: t(`requests.list.tab.${s}`), current: tab === s, count: counts[s] }))}
      />

      {requests.length === 0 ? (
        <p className="text-sm text-smoke">{t("requests.list.empty")}</p>
      ) : (
        <Sheet className="px-4 py-4 md:px-5">
          <RequestRows requests={requests} showRequester />
        </Sheet>
      )}
    </div>
  );
}
