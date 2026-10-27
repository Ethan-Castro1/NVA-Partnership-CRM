/** /app: the administrator's dashboard or the staff dashboard, by role. */
import { data, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/app._index";
import { AdminDashboard } from "~/components/dashboard/admin-dashboard";
import { longToday } from "~/components/dashboard/format";
import { StaffDashboard } from "~/components/dashboard/staff-dashboard";
import { makeT } from "~/i18n";
import { getLocale } from "~/i18n/locale.server";
import { requireUser } from "~/lib/auth.server";
import { getAdminDashboard, getStaffDashboard } from "~/lib/dashboard.server";
import { canViewPerson, isAdmin } from "~/lib/permissions.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("dashboard.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const locale = await getLocale(request, user.locale);
  const base = {
    firstName: user.name.trim().split(/\s+/)[0] || user.name,
    userId: user.id,
    // Formatted here so the server and browser show the same date.
    todayLabel: longToday(locale),
  };
  if (isAdmin(user)) return { ...base, role: "admin" as const, admin: await getAdminDashboard(user), staff: null };
  return { ...base, role: "staff" as const, admin: null, staff: await getStaffDashboard(user) };
}

/** Admin quick actions that need a person first: open their log form or their email page. */
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  if (!isAdmin(user)) throw data(null, { status: 403 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const personId = String(form.get("personId") ?? "").trim();
  if (intent !== "record" && intent !== "draft") return data({ intent, error: "badIntent" }, { status: 400 });
  if (!personId || personId.length > 100 || !(await canViewPerson(user, personId))) {
    return data({ intent, error: "personRequired" }, { status: 400 });
  }
  const id = encodeURIComponent(personId);
  return redirect(intent === "record" ? `/app/people/${id}#log-activity` : `/app/people/${id}/email`);
}

export default function Dashboard() {
  const loaderData = useLoaderData<typeof loader>();
  if (loaderData.role === "admin" && loaderData.admin) {
    return (
      <AdminDashboard
        data={loaderData.admin}
        firstName={loaderData.firstName}
        todayLabel={loaderData.todayLabel}
        userId={loaderData.userId}
      />
    );
  }
  return loaderData.staff ? (
    <StaffDashboard data={loaderData.staff} firstName={loaderData.firstName} todayLabel={loaderData.todayLabel} />
  ) : null;
}
