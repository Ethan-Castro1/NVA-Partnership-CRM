/** All Community Action Projects, or just mine, as a grid of cards. */
import { Link, useLoaderData } from "react-router";
import { Plus } from "lucide-react";
import type { Route } from "./+types/app.caps._index";
import { CapCard } from "~/components/caps/cap-bits";
import { EmptyState, PageHeader } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { listCaps } from "~/lib/caps.server";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("caps.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const mine = new URL(request.url).searchParams.get("show") === "mine";
  const caps = await listCaps(mine ? { ownerId: user.id } : {});
  return { caps, mine };
}

export default function Caps() {
  const { caps, mine } = useLoaderData<typeof loader>();
  const { t } = useT();
  const tabs = [
    { to: "/app/caps", label: t("caps.list.all"), current: !mine },
    { to: "/app/caps?show=mine", label: t("caps.list.mine"), current: mine },
  ];

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow={t("caps.eyebrow")}
        title={t("caps.title")}
        description={t("caps.description")}
        actions={
          <Button asChild variant="brand" size="lg">
            <Link to="/app/caps/new">
              <Plus aria-hidden="true" />
              {t("caps.list.new")}
            </Link>
          </Button>
        }
      />

      <nav aria-label={t("caps.list.tabsLabel")}>
        <ul className="inline-flex rounded-full border border-stone bg-taupe p-1">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <Link
                to={tab.to}
                aria-current={tab.current ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-4 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  tab.current ? "bg-canvas font-medium text-ink shadow-whisper" : "text-graphite hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {caps.length ? (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {caps.map((cap) => (
            <li key={cap.id}>
              <CapCard cap={cap} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={mine ? t("caps.list.emptyMine") : t("caps.list.empty")}
          body={t("caps.list.emptyBody")}
          action={
            <Button asChild variant="outline">
              <Link to="/app/caps/new">
                <Plus aria-hidden="true" />
                {t("caps.list.new")}
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
