import { Form, Link, data, redirect, useActionData, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { Field, FullLogo, LanguageToggle } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { makeT, useT } from "~/i18n";
import { getUser, login, safeNext } from "~/lib/auth.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("auth.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  if (user) throw redirect(safeNext(new URL(request.url).searchParams.get("next")));
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const result = await login(request, email, password);
  if (!result.ok) return data({ error: result.error, email }, { status: result.error === "auth.tooManyAttempts" ? 429 : 400 });
  return redirect(safeNext(String(form.get("next") ?? "")), { headers: { "Set-Cookie": result.setCookie } });
}

export default function Login() {
  const { t } = useT();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const busy = navigation.state === "submitting";

  return (
    <main className="relative grid min-h-screen place-items-center bg-[radial-gradient(ellipse_at_top,#fff3d1_0%,#fdfcfc_55%)] px-4 py-12">
      <LanguageToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-md rounded-[24px] bg-canvas p-8 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.35)] ring-1 ring-stone md:p-10">
        <Link to="/" className="mx-auto mb-6 flex w-fit items-center gap-2">
          <FullLogo className="max-w-[230px]" />
        </Link>
        <h1 className="text-center font-display text-3xl font-bold tracking-tight">{t("auth.title")}</h1>
        <p className="mt-2 text-center text-sm text-smoke">{t("auth.subtitle")}</p>

        <Form method="post" className="mt-8 grid gap-4">
          <input type="hidden" name="next" value={params.get("next") ?? ""} />
          <Field label={t("auth.email")} htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              defaultValue={actionData?.email}
              className="h-11 border-transparent bg-taupe"
            />
          </Field>
          <Field label={t("auth.password")} htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-11 border-transparent bg-taupe"
            />
          </Field>
          {actionData?.error && (
            <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
              {t(actionData.error)}
            </p>
          )}
          <Button type="submit" size="lg" className="mt-2 w-full" disabled={busy}>
            {busy ? t("auth.submitting") : t("auth.submit")}
          </Button>
        </Form>

        <p className="mt-6 text-center text-xs text-smoke">{t("auth.noAccount")}</p>
        <p className="mt-6 border-t border-stone pt-5 text-center text-sm">
          {t("auth.notStaff")}{" "}
          <Link to="/join" className="font-medium underline decoration-gold decoration-2 underline-offset-4">
            {t("auth.joinLink")}
          </Link>
        </p>
      </div>
    </main>
  );
}
