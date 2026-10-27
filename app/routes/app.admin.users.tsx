/** Staff accounts: create, change role, deactivate/reactivate, reset password. */
import { useEffect, useRef, useState } from "react";
import { data, useFetcher, useLoaderData } from "react-router";
import { UserPlus, X } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/app.admin.users";
import { formatDate } from "~/components/admin/format";
import { StaffActions, TempPasswordField, type StaffActionResult } from "~/components/admin/staff";
import { Field, PageHeader, PersonAvatar, Sheet } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { makeT, useT } from "~/i18n";
import { changeStaffAccount, emailTaken, getStaff, listStaff } from "~/lib/admin.server";
import {
  MIN_PASSWORD_LENGTH,
  createUser,
  endAllSessions,
  isLockedDemoAccount,
  passwordProblem,
  requireAdmin,
  setPassword,
} from "~/lib/auth.server";
import { ROLES } from "~/lib/constants";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("admin.users.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireAdmin(request);
  return { users: await listStaff(), meId: me.id, minLength: MIN_PASSWORD_LENGTH };
}

const id = z.string().min(1).max(100);
const ActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    name: z.string().trim().max(120),
    email: z.string().trim().toLowerCase().max(320),
    role: z.enum(ROLES).catch("staff"),
    password: z.string().max(200),
  }),
  z.object({ intent: z.literal("role"), userId: id, role: z.enum(ROLES) }),
  z.object({ intent: z.literal("active"), userId: id, active: z.enum(["true", "false"]) }),
  z.object({ intent: z.literal("reset"), userId: id, password: z.string().max(200) }),
]);

const fail = (error: Extract<StaffActionResult, { ok: false }>, status = 400) => data<StaffActionResult>(error, { status });

export async function action({ request }: Route.ActionArgs) {
  const me = await requireAdmin(request);
  const parsed = ActionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return fail({ ok: false, error: "admin.error.invalid" });
  const input = parsed.data;

  // Demo mode: every visitor shares the demo accounts, so their role, password and
  // active state stay as they are (reactivating one is still fine).
  const touchesDemo =
    input.intent === "role" || input.intent === "reset" || (input.intent === "active" && input.active === "false");
  if (touchesDemo && (await isLockedDemoAccount(input.userId))) return fail({ ok: false, error: "admin.error.demoAccount" }, 403);

  switch (input.intent) {
    case "create": {
      if (!input.name) return fail({ ok: false, error: "admin.error.nameRequired", field: "name" });
      if (!z.email().safeParse(input.email).success) return fail({ ok: false, error: "admin.error.emailInvalid", field: "email" });
      if (passwordProblem(input.password)) return fail({ ok: false, error: "admin.error.passwordTooShort", field: "password" });
      if (await emailTaken(input.email)) return fail({ ok: false, error: "admin.error.duplicateEmail", field: "email" }, 409);
      try {
        await createUser({ name: input.name, email: input.email, role: input.role, password: input.password });
      } catch (error) {
        // Two admins creating the same email at once: the unique index catches the second.
        if ((error as { code?: string }).code === "23505") return fail({ ok: false, error: "admin.error.duplicateEmail", field: "email" }, 409);
        throw error;
      }
      return data<StaffActionResult>({ ok: true, done: "created", name: input.name });
    }
    case "role": {
      const result = await changeStaffAccount(me.id, input.userId, { kind: "role", role: input.role });
      return result.ok ? data<StaffActionResult>({ ok: true, done: "role" }) : fail({ ok: false, error: result.error });
    }
    case "active": {
      const active = input.active === "true";
      const result = await changeStaffAccount(me.id, input.userId, { kind: "active", active });
      if (!result.ok) return fail({ ok: false, error: result.error });
      if (!active) await endAllSessions(input.userId);
      return data<StaffActionResult>({ ok: true, done: active ? "reactivated" : "deactivated" });
    }
    case "reset": {
      if (passwordProblem(input.password)) return fail({ ok: false, error: "admin.error.passwordTooShort", field: "password" });
      if (!(await getStaff(input.userId))) return fail({ ok: false, error: "admin.error.userNotFound" }, 404);
      await setPassword(input.userId, input.password);
      // Resetting your own password keeps this session; everyone else is signed out everywhere.
      await endAllSessions(input.userId, input.userId === me.id ? request : undefined);
      return data<StaffActionResult>({ ok: true, done: "reset" });
    }
  }
}

export default function StaffAccounts() {
  const { users, meId, minLength } = useLoaderData<typeof loader>();
  const { t } = useT();
  const [adding, setAdding] = useState(false);

  return (
    <div className="mx-auto grid w-full max-w-4xl min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={t("admin.users.title")}
        actions={
          adding ? (
            <Button variant="outline" size="lg" onClick={() => setAdding(false)}>
              <X aria-hidden="true" />
              {t("common.action.cancel")}
            </Button>
          ) : (
            <Button variant="brand" size="lg" onClick={() => setAdding(true)}>
              <UserPlus aria-hidden="true" />
              {t("admin.users.new")}
            </Button>
          )
        }
      />

      {adding && <CreateAccount minLength={minLength} />}

      <Sheet className="px-4 py-1 md:px-5">
        <ul className="divide-y divide-stone">
          {users.map((u) => (
            <li key={u.id} className={cn("flex items-center gap-3 py-3", !u.active && "opacity-70")}>
              <PersonAvatar name={u.name} className="hidden sm:flex" />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <span className="truncate">{u.name}</span>
                  {u.id === meId && <span className="shrink-0 rounded-full bg-gold-soft px-2 text-[0.7rem] font-medium text-gold-ink">{t("admin.users.you")}</span>}
                  {!u.active && (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-stone px-2 text-[0.7rem] font-medium text-smoke">
                      {t("admin.users.inactive")}
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-smoke">
                  {u.email} · <LastSignIn iso={u.last_login_at} />
                </span>
              </div>
              <StaffActions user={u} isSelf={u.id === meId} minLength={minLength} />
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

function LastSignIn({ iso }: { iso: string | null }) {
  const { t, locale } = useT();
  return iso ? <>{t("admin.users.lastSignIn", { date: formatDate(iso, locale) })}</> : <>{t("admin.users.neverSignedIn")}</>;
}

function CreateAccount({ minLength }: { minLength: number }) {
  const { t } = useT();
  const fetcher = useFetcher<StaffActionResult>();
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPasswordValue] = useState("");
  const [role, setRole] = useState<string>("staff");
  const busy = fetcher.state !== "idle";
  const result = fetcher.state === "idle" ? fetcher.data : undefined;
  const fieldError = (field: "name" | "email" | "password") =>
    result && !result.ok && result.field === field ? t(result.error, { min: minLength }) : undefined;

  // Clear the form after an account is created.
  useEffect(() => {
    if (result?.ok && result.done === "created") {
      formRef.current?.reset();
      setPasswordValue("");
      setRole("staff");
    }
  }, [result]);

  return (
    <Sheet className="p-5 md:p-6">
        <fetcher.Form method="post" ref={formRef} className="grid gap-4 sm:grid-cols-2" noValidate>
          <input type="hidden" name="intent" value="create" />
          <Field label={t("common.field.name")} htmlFor="new-name" error={fieldError("name")}>
            <Input id="new-name" name="name" required maxLength={120} autoComplete="off" aria-invalid={fieldError("name") ? true : undefined} />
          </Field>
          <Field label={t("common.field.email")} htmlFor="new-email" error={fieldError("email")}>
            <Input
              id="new-email"
              name="email"
              type="email"
              required
              maxLength={320}
              autoComplete="off"
              aria-invalid={fieldError("email") ? true : undefined}
            />
          </Field>
          <Field label={t("admin.col.role")} htmlFor="new-role">
            <Select name="role" value={role} onValueChange={setRole}>
              <SelectTrigger id="new-role" className="h-9 w-full bg-canvas">
                <SelectValue>{t(`common.role.${role === "admin" ? "admin" : "staff"}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`common.role.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <TempPasswordField
            id="new-password"
            minLength={minLength}
            value={password}
            onChange={setPasswordValue}
            error={fieldError("password")}
          />
          {result && !result.ok && !result.field && (
            <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink sm:col-span-2">
              {t(result.error)}
            </p>
          )}
          {result?.ok && result.done === "created" && (
            <p role="status" className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink sm:col-span-2">
              {t("admin.users.created", { name: result.name ?? "" })}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full sm:col-span-2 sm:w-fit">
            <UserPlus aria-hidden="true" />
            {busy ? t("admin.users.creating") : t("admin.users.createSubmit")}
          </Button>
        </fetcher.Form>
    </Sheet>
  );
}
