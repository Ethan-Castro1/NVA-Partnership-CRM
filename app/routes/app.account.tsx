/** My account: any signed-in staff member's name, language and password. */
import { useEffect, useRef, useState } from "react";
import { data, Link, useFetcher, useLoaderData } from "react-router";
import { KeyRound, Plug, Save } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/app.account";
import { Field, PageHeader, Panel, PersonAvatar, Sheet } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { makeT, useT, type MessageKey } from "~/i18n";
import { LOCALES } from "~/i18n/define";
import { langCookie } from "~/i18n/locale.server";
import { getPasswordHash, updateOwnProfile } from "~/lib/admin.server";
import {
  MIN_PASSWORD_LENGTH,
  endAllSessions,
  passwordProblem,
  requireUser,
  setPassword,
  verifyPassword,
} from "~/lib/auth.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("account.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { user, minLength: MIN_PASSWORD_LENGTH };
}

type FieldName = "name" | "current" | "next" | "confirm";
type AccountResult =
  | { ok: true; done: "profile" | "password" }
  | { ok: false; form: "profile" | "password"; error: MessageKey; field?: FieldName };

const ActionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("profile"), name: z.string().trim().max(120), locale: z.enum(LOCALES) }),
  z.object({
    intent: z.literal("password"),
    current: z.string().max(200),
    next: z.string().max(200),
    confirm: z.string().max(200),
  }),
]);

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const parsed = ActionSchema.safeParse(Object.fromEntries(await request.formData()));
  const fail = (result: Extract<AccountResult, { ok: false }>) => data<AccountResult>(result, { status: 400 });
  if (!parsed.success) return fail({ ok: false, form: "profile", error: "account.error.invalid" });
  const input = parsed.data;

  if (input.intent === "profile") {
    if (!input.name) return fail({ ok: false, form: "profile", error: "account.error.nameRequired", field: "name" });
    await updateOwnProfile(user.id, { name: input.name, locale: input.locale });
    // The language cookie wins over the saved preference, so update both.
    return data<AccountResult>(
      { ok: true, done: "profile" },
      { headers: { "Set-Cookie": await langCookie.serialize(input.locale) } },
    );
  }

  const hash = await getPasswordHash(user.id);
  if (!hash || !(await verifyPassword(input.current, hash)))
    return fail({ ok: false, form: "password", error: "account.error.currentWrong", field: "current" });
  if (passwordProblem(input.next)) return fail({ ok: false, form: "password", error: "account.error.tooShort", field: "next" });
  if (input.next !== input.confirm) return fail({ ok: false, form: "password", error: "account.error.mismatch", field: "confirm" });
  await setPassword(user.id, input.next);
  await endAllSessions(user.id, request);
  return data<AccountResult>({ ok: true, done: "password" });
}

export default function Account() {
  const { user, minLength } = useLoaderData<typeof loader>();
  const { t } = useT();

  return (
    <div className="space-y-6">
      <PageHeader title={t("account.title")} description={t("account.description")} />
      <Sheet className="flex items-center gap-3">
        <PersonAvatar name={user.name} className="size-11" />
        <div className="grid min-w-0">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-sm text-smoke">
            {t("account.signedInAs", { email: user.email })} · {t(`common.role.${user.role}`)}
          </span>
        </div>
      </Sheet>
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileForm name={user.name} locale={user.locale} />
        <PasswordForm minLength={minLength} />
      </div>
      <Panel title={t("account.connect.title")} className="h-fit">
        <Button asChild variant="outline" size="sm">
          <Link to="/app/connect">
            <Plug aria-hidden="true" />
            {t("account.connect.setUp")}
          </Link>
        </Button>
      </Panel>
    </div>
  );
}

function useAccountFetcher(form: "profile" | "password") {
  const fetcher = useFetcher<AccountResult>({ key: `account-${form}` });
  const result = fetcher.state === "idle" ? fetcher.data : undefined;
  const mine = result && (result.ok ? result.done === form : result.form === form) ? result : undefined;
  return { fetcher, result: mine, busy: fetcher.state !== "idle" };
}

function ProfileForm({ name, locale }: { name: string; locale: "en" | "es" }) {
  const { t } = useT();
  const { fetcher, result, busy } = useAccountFetcher("profile");
  const nameError = result && !result.ok && result.field === "name" ? t(result.error) : undefined;
  const [chosen, setChosen] = useState<"en" | "es">(locale);

  return (
    <Panel title={t("account.profile.title")} className="h-fit">
      <Sheet>
        <fetcher.Form method="post" className="grid gap-4" noValidate>
          <input type="hidden" name="intent" value="profile" />
          <Field label={t("common.field.name")} htmlFor="account-name" error={nameError}>
            <Input
              id="account-name"
              name="name"
              defaultValue={name}
              required
              maxLength={120}
              autoComplete="name"
              aria-invalid={nameError ? true : undefined}
            />
          </Field>
          <Field label={t("account.profile.language")} htmlFor="account-locale" hint={t("account.profile.languageHint")}>
            <Select name="locale" value={chosen} onValueChange={(v) => setChosen(v === "es" ? "es" : "en")}>
              <SelectTrigger id="account-locale" className="h-9 w-full bg-canvas">
                {/* Children so the server render shows the value before the menu mounts. */}
                <SelectValue>{t(`common.lang.${chosen}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l} value={l} lang={l}>
                    {t(`common.lang.${l}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Feedback result={result} />
          <Button type="submit" disabled={busy} className="w-full sm:w-fit">
            <Save aria-hidden="true" />
            {busy ? t("common.state.saving") : t("account.profile.save")}
          </Button>
        </fetcher.Form>
      </Sheet>
    </Panel>
  );
}

function PasswordForm({ minLength }: { minLength: number }) {
  const { t } = useT();
  const { fetcher, result, busy } = useAccountFetcher("password");
  const formRef = useRef<HTMLFormElement>(null);
  const errorFor = (field: FieldName) =>
    result && !result.ok && result.field === field ? t(result.error, { min: minLength }) : undefined;

  // Never leave passwords sitting in the fields after a change.
  useEffect(() => {
    if (result?.ok) formRef.current?.reset();
  }, [result]);

  return (
    <Panel title={t("account.password.title")} className="h-fit">
      <p className="-mt-2 mb-4 text-sm text-smoke">{t("account.password.description")}</p>
      <Sheet>
        <fetcher.Form method="post" ref={formRef} className="grid gap-4" noValidate>
          <input type="hidden" name="intent" value="password" />
          <Field label={t("account.password.current")} htmlFor="pw-current" error={errorFor("current")}>
            <Input
              id="pw-current"
              name="current"
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
              aria-invalid={errorFor("current") ? true : undefined}
            />
          </Field>
          <Field
            label={t("account.password.new")}
            htmlFor="pw-next"
            hint={t("account.password.hint", { min: minLength })}
            error={errorFor("next")}
          >
            <Input
              id="pw-next"
              name="next"
              type="password"
              autoComplete="new-password"
              required
              minLength={minLength}
              maxLength={200}
              aria-invalid={errorFor("next") ? true : undefined}
            />
          </Field>
          <Field label={t("account.password.confirm")} htmlFor="pw-confirm" error={errorFor("confirm")}>
            <Input
              id="pw-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              maxLength={200}
              aria-invalid={errorFor("confirm") ? true : undefined}
            />
          </Field>
          <Feedback result={result} />
          <Button type="submit" disabled={busy} className="w-full sm:w-fit">
            <KeyRound aria-hidden="true" />
            {busy ? t("common.state.saving") : t("account.password.submit")}
          </Button>
        </fetcher.Form>
      </Sheet>
    </Panel>
  );
}

function Feedback({ result }: { result: AccountResult | undefined }) {
  const { t } = useT();
  if (!result) return null;
  if (result.ok)
    return (
      <p role="status" className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink">
        {t(result.done === "profile" ? "account.profile.saved" : "account.password.saved")}
      </p>
    );
  // Field errors show under their field; anything else shows here.
  if (result.field) return null;
  return (
    <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
      {t(result.error)}
    </p>
  );
}
