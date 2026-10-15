/**
 * GET /app/admin/export.csv: everyone in the CRM as a spreadsheet, with the
 * column names and vocabulary in the admin's language.
 */
import type { Route } from "./+types/app.admin.export";
import { makeT, translateMaybe } from "~/i18n";
import { getLocale } from "~/i18n/locale.server";
import { listPeopleForExport, toCsv } from "~/lib/admin.server";
import { requireAdmin } from "~/lib/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const locale = await getLocale(request, user.locale);
  const t = makeT(locale);
  const label = (prefix: string, value: string) => translateMaybe(locale, `common.${prefix}.${value}`, value);
  const people = await listPeopleForExport();

  const header = [
    t("common.field.name"),
    t("common.field.email"),
    t("common.field.phone"),
    t("common.field.organization"),
    t("common.field.title"),
    t("common.field.contributions"),
    t("common.field.skills"),
    t("common.field.capTopics"),
    t("common.field.affiliations"),
    t("common.field.status"),
    t("common.field.source"),
    t("common.field.language"),
    t("common.field.availability"),
    t("admin.csv.created"),
    t("admin.csv.updated"),
  ];
  const rows = people.map((p) => [
    p.full_name,
    p.email,
    p.phone,
    p.organization_name,
    p.title,
    p.contribution_types.map((type) => label("contribution", type)),
    p.skills,
    p.cap_topics,
    p.affiliations.map((a) => label("affiliation", a)),
    label("status", p.status),
    label("source", p.source),
    label("language", p.preferred_language),
    p.availability,
    p.created_at.slice(0, 10),
    p.updated_at.slice(0, 10),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  return new Response(toCsv([header, ...rows]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nva-village-partners-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
