/** Staff Requests (admin): every request, open ones first, introductions on top. */
import { Link } from "react-router";
import type { Route } from "./+types/app.admin.requests";
import { EmptyState, PageHeader, Panel } from "~/components/nva";
import { IntroTag, RequestStatusBadge, requestWhen } from "~/components/requests";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { makeT, useT } from "~/i18n";
import { requireAdmin } from "~/lib/auth.server";
import type { RequestStatus } from "~/lib/constants";
import { getRequestAttention, listRequests } from "~/lib/requests.server";
import { cn } from "~/lib/utils";

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
  const [all, attention] = await Promise.all([listRequests(admin, { limit: 500 }), getRequestAttention(admin, { limit: 1 })]);
  const counts = Object.fromEntries(TABS.map((s) => [s, s === "all" ? all.length : all.filter((r) => r.status === s).length])) as Record<Tab, number>;
  let requests = tab === "all" ? all : all.filter((r) => r.status === tab);
  // Introductions first among open ones; otherwise the list order (newest first).
  if (tab === "open") requests = [...requests].sort((a, b) => Number(b.kind === "introduction") - Number(a.kind === "introduction"));
  return { tab, counts, requests, introductions: attention.introductions };
}

export default function AdminRequests({ loaderData }: Route.ComponentProps) {
  const { t, locale } = useT();
  const { tab, counts, requests, introductions } = loaderData;
  return (
    <div className="grid w-full gap-6">
      <PageHeader title={t("requests.list.title")} description={t("requests.list.description")} />

      <nav aria-label={t("requests.list.tabs")} className="max-w-full overflow-x-auto">
        <ul className="inline-flex rounded-full border border-stone bg-taupe p-1">
          {TABS.map((s) => (
            <li key={s}>
              <Link
                to={s === "open" ? "?" : `?status=${s}`}
                preventScrollReset
                aria-current={tab === s ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  tab === s ? "bg-canvas font-medium text-ink shadow-whisper" : "text-graphite hover:text-ink",
                )}
              >
                {t(`requests.list.tab.${s}`)}
                <span className="rounded-full px-1.5 text-xs text-smoke tabular-nums">{counts[s]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "open" && introductions > 0 && (
        <p className="w-fit rounded-full bg-gold-soft px-3 py-1 text-sm text-gold-ink">{t("requests.list.introductions", { count: introductions })}</p>
      )}

      {requests.length === 0 ? (
        <EmptyState title={t("requests.list.empty")} />
      ) : (
        <Panel bodyClassName="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("requests.list.col.request")}</TableHead>
                <TableHead>{t("requests.list.col.from")}</TableHead>
                <TableHead>{t("requests.list.col.when")}</TableHead>
                <TableHead>{t("requests.list.col.people")}</TableHead>
                <TableHead>{t("requests.list.col.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-80 whitespace-normal">
                    <Link to={`/app/requests/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                      {r.need}
                    </Link>
                    {r.kind === "introduction" && <IntroTag className="ml-2" />}
                    {r.cap_title && <p className="text-xs text-smoke">{r.cap_title}</p>}
                  </TableCell>
                  <TableCell>{r.requester_name}</TableCell>
                  <TableCell className="whitespace-normal">{requestWhen(r, locale)}</TableCell>
                  <TableCell className="max-w-56 whitespace-normal">{r.people.map((p) => p.full_name).join(", ")}</TableCell>
                  <TableCell>
                    <RequestStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}

