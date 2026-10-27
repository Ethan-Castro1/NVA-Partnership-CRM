/**
 * One staff request. Staff see their own and ones shared with them (anyone
 * else's is a 404, the same as a missing one). The requester can mark it
 * completed, cancel, reopen, edit and share it with colleagues; a colleague
 * it is shared with can mark it completed with a note. Admins see every
 * request and also reply, assign people, share and set the status.
 */
import { Form, Link, data, useNavigation } from "react-router";
import { ArrowLeft, CheckCircle2, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Route } from "./+types/app.requests.$requestId";
import { Field, PageHeader, Panel, Sheet } from "~/components/nva";
import { formatDate } from "~/components/people/format";
import { MoreDetails } from "~/components/crm/crm-bits";
import { NativeSelect, RequestForm, RequestStatusBadge, requestWhen } from "~/components/requests";
import { ResourceActions } from "~/components/resources/resource-actions";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { makeT, useT, type MessageKey } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { ACTIVE_REQUEST_STATUSES, REQUEST_PERSON_ROLES, REQUEST_STATUSES, type RequestPersonRole, type RequestStatus } from "~/lib/constants";
import { isAdmin, notFound } from "~/lib/permissions.server";
import {
  adminUpdateRequest,
  assignPerson,
  getRequest,
  listAdmins,
  listCapOptions,
  listPersonOptions,
  listShareOptions,
  removePerson,
  requestAccess,
  requestInputFromForm,
  setRequestStatus,
  shareRequest,
  unshareRequest,
  updateRequestDetails,
  type RequestErrors,
} from "~/lib/requests.server";
import { savedIdsAmong } from "~/lib/saved.server";

export const meta: Route.MetaFunction = ({ data: loaderData, matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${loaderData?.request.need ?? t("requests.index.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const found = await getRequest(user, params.requestId);
  if (!found) notFound();
  const admin = isAdmin(user);
  const access = requestAccess(user, found);
  const [caps, saved, admins, people, shareOptions] = await Promise.all([
    listCapOptions(),
    savedIdsAmong(user, found.people.map((p) => p.id)),
    admin ? listAdmins(user) : Promise.resolve([]),
    admin ? listPersonOptions(user) : Promise.resolve([]),
    listShareOptions(user, found.id),
  ]);
  return {
    request: found,
    caps,
    savedIds: [...saved],
    admin,
    admins,
    people,
    isMine: found.requester_id === user.id,
    access,
    shareOptions,
  };
}

type ActionResult = { ok: boolean; message?: "completed" | "saved" | "shared"; error?: MessageKey; errors?: RequestErrors };

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const id = params.requestId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const text = (name: string) => (typeof form.get(name) === "string" ? String(form.get(name)) : null);
  const fail = (status: number, error: MessageKey = "requests.error.generic") => data<ActionResult>({ ok: false, error }, { status });
  const forbidden = (): never => {
    throw new Response("Forbidden", { status: 403 });
  };
  const fromStatus = (r: Awaited<ReturnType<typeof setRequestStatus>>, message?: ActionResult["message"]) =>
    r.ok
      ? data<ActionResult>({ ok: true, message })
      : r.error === "not_found"
        ? notFound()
        : r.error === "forbidden"
          ? forbidden()
          : fail(r.error === "locked" ? 409 : 400, r.error === "locked" ? "requests.error.locked" : "requests.error.generic");

  switch (intent) {
    case "complete":
      return fromStatus(await setRequestStatus(user, id, { status: "completed", note: text("note") }), "completed");
    case "cancel":
      return fromStatus(await setRequestStatus(user, id, { status: "canceled" }));
    case "reopen":
      return fromStatus(await setRequestStatus(user, id, { status: "open" }));
    case "edit": {
      const result = await updateRequestDetails(user, id, requestInputFromForm(form));
      if (!result) notFound();
      if (!result.ok && "forbidden" in result) forbidden();
      if (!result.ok) return data<ActionResult>({ ok: false, errors: result.errors, error: Object.keys(result.errors).length ? undefined : "requests.error.locked" }, { status: 400 });
      return data<ActionResult>({ ok: true, message: "saved" });
    }
    case "share":
    case "unshare": {
      const userId = text("userId") ?? "";
      const r = intent === "share" ? await shareRequest(user, id, userId) : await unshareRequest(user, id, userId);
      if (r.ok) return data<ActionResult>({ ok: true, message: intent === "share" ? "shared" : "saved" });
      if (r.error === "not_found") notFound();
      if (r.error === "forbidden") forbidden();
      return fail(400, "requests.share.error");
    }
  }

  // Everything below is admin only.
  if (!isAdmin(user)) {
    if (!(await getRequest(user, id))) notFound();
    throw new Response("Forbidden", { status: 403 });
  }
  switch (intent) {
    case "admin-save": {
      const status = text("status") as RequestStatus | null;
      const owner = text("assignedTo");
      return fromStatus(
        await adminUpdateRequest(user, id, {
          status: status && (REQUEST_STATUSES as readonly string[]).includes(status) ? status : undefined,
          response: text("response") ?? undefined,
          assignedTo: owner === null ? undefined : owner || null,
          note: text("note"),
        }),
        "saved",
      );
    }
    case "add-person": {
      const role = (text("role") ?? "assigned") as RequestPersonRole;
      if (!REQUEST_PERSON_ROLES.includes(role)) return fail(400);
      const ok = await assignPerson(user, id, text("personId") ?? "", role);
      return ok ? data<ActionResult>({ ok: true, message: "saved" }) : fail(404, "requests.error.personNotFound");
    }
    case "remove-person": {
      const ok = await removePerson(user, id, text("personId") ?? "");
      return ok ? data<ActionResult>({ ok: true, message: "saved" }) : fail(404, "requests.error.personNotFound");
    }
    default:
      return fail(400);
  }
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-smoke">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default function RequestDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { t, locale } = useT();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const { request: r, caps, admin, admins, people, isMine, access, shareOptions } = loaderData;
  const canManage = access !== "shared";
  const savedIds = new Set(loaderData.savedIds);
  const active = ACTIVE_REQUEST_STATUSES.includes(r.status);
  const when = requestWhen(r, locale);
  const result = actionData as ActionResult | undefined;
  const onRequest = new Set(r.people.map((p) => p.id));

  return (
    <div className="mx-auto grid min-w-0 grid-cols-[minmax(0,1fr)] w-full max-w-3xl gap-6">
      <Link
        to={admin ? "/app/admin/requests" : "/app/requests"}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-graphite hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {admin ? t("requests.detail.backAdmin") : t("requests.detail.back")}
      </Link>

      <PageHeader
        title={r.need}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <RequestStatusBadge status={r.status} />
            <span>
              {[
                r.kind === "introduction" ? t("requests.item.intro") : null,
                !isMine ? t("requests.detail.from", { name: r.requester_name }) : null,
                t("requests.detail.sent", { date: formatDate(r.created_at, locale) }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        }
      />

      {result?.message === "completed" && (
        <p role="status" className="flex items-center gap-2 rounded-card bg-sage-soft px-4 py-3 text-sm text-sage-ink">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {t("requests.complete.done")}
        </p>
      )}
      {result?.message === "shared" && (
        <p role="status" className="rounded-card bg-sage-soft px-4 py-3 text-sm text-sage-ink">
          {t("requests.share.done")}
        </p>
      )}
      {result?.message === "saved" && (
        <p role="status" className="rounded-card bg-sage-soft px-4 py-3 text-sm text-sage-ink">
          {t("requests.admin.saved")}
        </p>
      )}
      {result?.error && (
        <p role="alert" className="rounded-card bg-rust-soft px-4 py-3 text-sm text-rust-ink">
          {t(result.error)}
        </p>
      )}

      <Sheet className="grid gap-5 p-5 md:p-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Fact label={t("requests.detail.when")}>{when || <span className="text-smoke">{t("requests.detail.noDate")}</span>}</Fact>
          {r.participant_count != null && <Fact label={t("requests.detail.participants")}>{r.participant_count}</Fact>}
          {r.cap_title && (
            <Fact label={t("requests.detail.cap")}>
              <Link to={`/app/caps/${r.cap_id}`} className="underline-offset-4 hover:underline">
                {r.cap_title}
              </Link>
            </Fact>
          )}
          {r.activity && <Fact label={t("requests.detail.activity")}>{r.activity}</Fact>}
        </dl>
        {r.description && (
          <div className="grid gap-1">
            <h2 className="text-xs text-smoke">{t("requests.detail.details")}</h2>
            <p className="text-sm whitespace-pre-line">{r.description}</p>
          </div>
        )}
        {r.status === "completed" && r.completed_note && (
          <div className="grid gap-1">
            <h2 className="text-xs text-smoke">{t("requests.detail.completedNote")}</h2>
            <p className="text-sm whitespace-pre-line">{r.completed_note}</p>
          </div>
        )}
      </Sheet>

      {r.people.length > 0 && (
        <Panel title={t("requests.detail.people")}>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
            {r.people.map((p) => (
              <li key={p.id} className="flex min-w-0 items-center justify-between gap-3 rounded-card bg-canvas px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/app/people/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                    {p.full_name}
                  </Link>
                  <p className="truncate text-xs text-smoke">
                    {[t(`requests.role.${p.request_role}`), p.title, p.organization_name].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ResourceActions person={p} saved={savedIds.has(p.id)} compact hideRequest />
                  {admin && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="remove-person" />
                      <input type="hidden" name="personId" value={p.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("requests.admin.remove", { name: p.full_name })}
                        title={t("requests.admin.remove", { name: p.full_name })}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </Form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {(r.response || !admin) && (
        <Panel title={t("requests.detail.reply")}>
          {r.response ? (
            <p className="text-sm whitespace-pre-line">{r.response}</p>
          ) : (
            <p className="text-sm text-smoke">{t("requests.detail.noReply")}</p>
          )}
        </Panel>
      )}

      {(canManage || r.shared_with.length > 0) && (
        <Panel title={t("requests.share.title")}>
          <div className="grid gap-4">
            {r.shared_with.length ? (
              <ul className="flex flex-wrap gap-2">
                {r.shared_with.map((s) => (
                  <li key={s.user_id} className="inline-flex items-center gap-1 rounded-full border border-stone bg-canvas py-1 pr-1 pl-3 text-sm">
                    {s.name}
                    {canManage && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="unshare" />
                        <input type="hidden" name="userId" value={s.user_id} />
                        <Button type="submit" variant="ghost" size="xs" disabled={busy} aria-label={t("requests.share.remove", { name: s.name })}>
                          {t("requests.share.removeShort")}
                        </Button>
                      </Form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              !(canManage && shareOptions.length > 0) && (
                <p className="text-sm text-smoke">
                  {isMine ? t("requests.share.none") : t("requests.share.noneAdmin", { name: r.requester_name })}
                </p>
              )
            )}
            {canManage && shareOptions.length > 0 && (
              <Form method="post" className="grid gap-2">
                <input type="hidden" name="intent" value="share" />
                <label htmlFor="share-user" className="sr-only">
                  {t("requests.share.label")}
                </label>
                <div className="flex gap-2">
                  <NativeSelect id="share-user" name="userId" required defaultValue="" key={r.shared_with.length}>
                    <option value="" disabled>
                      {t("requests.share.pick")}
                    </option>
                    {shareOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button type="submit" variant="outline" disabled={busy}>
                    {t("requests.share.submit")}
                  </Button>
                </div>
              </Form>
            )}
          </div>
        </Panel>
      )}

      {!admin && active && (
        <Panel title={t("requests.complete.title")}>
          <Form method="post" className="grid gap-3">
            <input type="hidden" name="intent" value="complete" />
            <Field label={t("requests.complete.note")} htmlFor="note" optional>
              <Textarea id="note" name="note" rows={2} maxLength={1000} placeholder={t("requests.complete.notePlaceholder")} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="brand" disabled={busy}>
                {t("requests.complete.submit")}
              </Button>
            </div>
          </Form>
        </Panel>
      )}

      {admin && (
        <Panel title={t("requests.admin.title")}>
          <div className="grid gap-6">
            <Form method="post" className="grid gap-4">
              <input type="hidden" name="intent" value="admin-save" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("requests.admin.status")} htmlFor="status">
                  <NativeSelect id="status" name="status" defaultValue={r.status} key={r.status}>
                    {REQUEST_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`common.requestStatus.${s}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={t("requests.admin.owner")} htmlFor="assignedTo">
                  <NativeSelect id="assignedTo" name="assignedTo" defaultValue={r.assigned_to ?? ""} key={r.assigned_to ?? ""}>
                    <option value="">{t("requests.admin.ownerNone")}</option>
                    {admins.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Field label={t("requests.admin.reply", { name: r.requester_name })} htmlFor="response" optional>
                <Textarea
                  id="response"
                  name="response"
                  rows={3}
                  maxLength={2000}
                  defaultValue={r.response ?? ""}
                  placeholder={t("requests.admin.replyPlaceholder")}
                />
              </Field>
              <MoreDetails label={t("requests.form.more")}>
                <Field label={t("requests.admin.completeNote")} htmlFor="admin-note" optional>
                  <Textarea id="admin-note" name="note" rows={2} maxLength={1000} placeholder={t("requests.complete.notePlaceholder")} />
                </Field>
              </MoreDetails>
              <div>
                <Button type="submit" variant="brand" disabled={busy}>
                  {t("requests.admin.save")}
                </Button>
              </div>
            </Form>

            <Form method="post" className="grid gap-2 border-t border-stone pt-5">
              <input type="hidden" name="intent" value="add-person" />
              <input type="hidden" name="role" value="assigned" />
              <Field label={t("requests.admin.addPerson")} htmlFor="add-person">
                <div className="flex gap-2">
                  <NativeSelect id="add-person" name="personId" required defaultValue="">
                    <option value="" disabled>
                      {t("requests.admin.addPersonPick")}
                    </option>
                    {people
                      .filter((p) => !onRequest.has(p.id) || r.people.some((rp) => rp.id === p.id && rp.request_role === "interest"))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.organization_name ? `${p.full_name} (${p.organization_name})` : p.full_name}
                        </option>
                      ))}
                  </NativeSelect>
                  <Button type="submit" variant="outline" disabled={busy}>
                    {t("requests.admin.addPersonSubmit")}
                  </Button>
                </div>
              </Field>
            </Form>
          </div>
        </Panel>
      )}

      {canManage && (active || r.status === "canceled") && (
        <div className="flex flex-wrap items-center gap-2">
          {active && canManage && (
            <MoreDetails label={t("requests.detail.edit")} className="w-full" open={!!result?.errors}>
              <div className="rounded-card bg-canvas p-5 shadow-whisper">
                <RequestForm
                  caps={caps}
                  intent="edit"
                  brand={false}
                  errors={result?.errors}
                  defaults={{
                    need: r.need,
                    description: r.description,
                    capId: r.cap_id,
                    activity: r.activity,
                    preferredDate: r.preferred_date,
                    timeframe: r.timeframe,
                    participantCount: r.participant_count,
                  }}
                  submitLabel={t("requests.form.save")}
                  pendingLabel={t("requests.form.saving")}
                  cancelTo={`/app/requests/${r.id}`}
                />
              </div>
            </MoreDetails>
          )}
          {(isMine || admin) && (
            <Form method="post">
              <input type="hidden" name="intent" value={active ? "cancel" : "reopen"} />
              <Button type="submit" variant={active ? "ghost" : "outline"} size="sm" disabled={busy}>
                {active ? t("requests.status.cancel") : t("requests.status.reopen")}
              </Button>
            </Form>
          )}
        </div>
      )}
    </div>
  );
}
