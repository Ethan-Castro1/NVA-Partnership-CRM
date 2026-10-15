/** Staff accounts: create, change role, deactivate/reactivate, reset password. */
import { useEffect, useRef, useState } from "react";
import { data, useFetcher, useLoaderData } from "react-router";
import { UserPlus } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/app.admin.users";
import { formatDate } from "~/components/admin/format";
import { StaffActions, TempPasswordField, type StaffActionResult } from "~/components/admin/staff";
import { Field, PageHeader, Panel, PersonAvatar, Sheet } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { makeT, useT } from "~/i18n";
import { changeStaffAccount, emailTaken, getStaff, listStaff, type StaffRow } from "~/lib/admin.server";
import {
  MIN_PASSWORD_LENGTH,
  createUser,
  endAllSessions,
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
    role: z.enum(ROLES).catch("teacher"),
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

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("common.nav.adminSection")} title={t("admin.users.title")} description={t("admin.users.description")} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel title={t("admin.users.listTitle")} className="min-w-0">
          <Sheet className="p-0">
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">{t("admin.col.name")}</TableHead>
                    <TableHead>{t("admin.col.account")}</TableHead>
                    <TableHead>{t("admin.col.lastSignIn")}</TableHead>
                    <TableHead className="pr-5">{t("admin.col.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} className={cn(!u.active && "bg-taupe/50")}>
                      <TableCell className="pl-5">
                        <UserCell user={u} isSelf={u.id === meId} />
                      </TableCell>
                      <TableCell>
                        <ActiveBadge active={u.active} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-smoke">
                        <LastSignIn iso={u.last_login_at} />
                      </TableCell>
                      <TableCell className="pr-5 whitespace-normal">
                        <StaffActions user={u} isSelf={u.id === meId} minLength={minLength} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y divide-stone lg:hidden">
              {users.map((u) => (
                <li key={u.id} className={cn("grid gap-3 p-4", !u.active && "bg-taupe/50")}>
                  <UserCell user={u} isSelf={u.id === meId} />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-smoke">
                    <ActiveBadge active={u.active} />
                    <span>
                      {t("admin.col.lastSignIn")}: <LastSignIn iso={u.last_login_at} />
                    </span>
                  </div>
                  <StaffActions user={u} isSelf={u.id === meId} minLength={minLength} />
                </li>
              ))}
            </ul>
          </Sheet>
        </Panel>

        <CreateAccount minLength={minLength} />
      </div>
    </div>
  );
}

function UserCell({ user, isSelf }: { user: StaffRow; isSelf: boolean }) {
  const { t } = useT();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PersonAvatar name={user.name} />
      <div className="grid min-w-0">
        <span className="flex items-center gap-2 truncate font-medium">
          {user.name}
          {isSelf && <span className="rounded-full bg-gold-soft px-2 text-[0.7rem] font-medium text-gold-ink">{t("admin.users.you")}</span>}
        </span>
        <span className="truncate text-xs text-smoke">{user.email}</span>
      </div>
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[0.7rem] font-medium",
        active ? "bg-sage-soft text-sage-ink" : "bg-stone text-smoke",
      )}
    >
      {active ? t("admin.users.active") : t("admin.users.inactive")}
    </span>
  );
}

function LastSignIn({ iso }: { iso: string | null }) {
  const { t, locale } = useT();
  return iso ? <time dateTime={iso}>{formatDate(iso, locale)}</time> : <span>{t("admin.users.never")}</span>;
}

function CreateAccount({ minLength }: { minLength: number }) {
  const { t } = useT();
  const fetcher = useFetcher<StaffActionResult>();
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPasswordValue] = useState("");
  const [role, setRole] = useState<string>("teacher");
  const busy = fetcher.state !== "idle";
  const result = fetcher.state === "idle" ? fetcher.data : undefined;
  const fieldError = (field: "name" | "email" | "password") =>
    result && !result.ok && result.field === field ? t(result.error, { min: minLength }) : undefined;

  // Clear the form after an account is created.
  useEffect(() => {
    if (result?.ok && result.done === "created") {
      formRef.current?.reset();
      setPasswordValue("");
      setRole("teacher");
    }
  }, [result]);

  return (
    <Panel title={t("admin.users.create")} className="h-fit">
      <p className="-mt-2 mb-4 text-sm text-smoke">{t("admin.users.createHint")}</p>
      <Sheet>
        <fetcher.Form method="post" ref={formRef} className="grid gap-4" noValidate>
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
                <SelectValue>{t(`common.role.${role === "admin" ? "admin" : "teacher"}`)}</SelectValue>
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
            <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
              {t(result.error)}
            </p>
          )}
          {result?.ok && result.done === "created" && (
            <p role="status" className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink">
              {t("admin.users.created", { name: result.name ?? "" })}
            </p>
          )}
          <Button type="submit" variant="brand" disabled={busy} className="w-full sm:w-fit">
            <UserPlus aria-hidden="true" />
            {busy ? t("admin.users.creating") : t("admin.users.createSubmit")}
          </Button>
        </fetcher.Form>
      </Sheet>
    </Panel>
  );
}
