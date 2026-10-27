/** /app/organizations (admins only): every organization with its people counts. */
import { Form, Link, useLoaderData } from "react-router";
import { Search, Users } from "lucide-react";
import type { Route } from "./+types/app.organizations._index";
import { OrganizationList } from "~/components/orgs/organization-list";
import { EmptyState, PageHeader } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { makeT, useT } from "~/i18n";
import { requireAdmin } from "~/lib/auth.server";
import { listOrganizations } from "~/lib/organizations.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("directory.orgs.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 200);
  return { q, organizations: await listOrganizations(admin, { q }) };
}

export default function Organizations() {
  const { q, organizations } = useLoaderData<typeof loader>();
  const { t } = useT();
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("directory.orgs.title")}
        description={t("directory.orgs.description")}
        actions={
          <Button asChild variant="outline">
            <Link to="/app/people">
              <Users aria-hidden="true" />
              {t("directory.adminTitle")}
            </Link>
          </Button>
        }
      />
      <Form method="get" role="search" className="flex flex-col gap-2 rounded-card bg-taupe p-4 sm:flex-row md:p-5">
        <div className="relative flex-1">
          <label htmlFor="orgs-q" className="sr-only">
            {t("directory.orgs.searchLabel")}
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-smoke" aria-hidden="true" />
          <Input
            id="orgs-q"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={q}
            placeholder={t("directory.orgs.searchPlaceholder")}
            className="h-11 rounded-full pl-10"
          />
        </div>
        <Button type="submit" size="lg" className="shrink-0">
          {t("common.action.search")}
        </Button>
      </Form>
      {organizations.length ? (
        <OrganizationList items={organizations} />
      ) : (
        <EmptyState
          title={q ? t("directory.emptyTitle") : t("directory.orgs.empty")}
          body={q ? t("directory.orgs.emptySearch") : t("directory.orgs.emptyBody")}
          action={
            q ? (
              <Button asChild variant="outline">
                <Link to="/app/organizations">{t("common.action.clear")}</Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
