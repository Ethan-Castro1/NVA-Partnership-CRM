import { Form, Link, data, redirect, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { LogIn, ShieldCheck, UserRound } from "lucide-react";
import type { Route } from "./+types/login";
import { Field, FullLogo, LanguageToggle } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { makeT, useT } from "~/i18n";
import { demoLogin, getUser, isDemoLoginEnabled, isPlaylabSignInEnabled, login, safeNext } from "~/lib/auth.server";
import type { Role } from "~/lib/constants";
import { canAccessPath } from "~/lib/permissions.server";
import { PLAYLAB_SIGN_IN_ERRORS, type PlaylabSignInError } from "~/lib/playlab-sign-in.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("auth.title")} | ${t("common.schoolName")}` }];
};

/** Where to go after signing in: `next` when it's a safe same-site path this role may open, else /app. */
function landingFor(role: Role, next: string | null | undefined): string {
  const target = safeNext(next);
  return canAccessPath(role, target) ? target : "/app";
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  const params = new URL(request.url).searchParams;
  if (user) throw redirect(landingFor(user.role, params.get("next")));
  // Why a Playlab sign-in came back here (only the known keys).
  const error = params.get("error");
  const playlabError = PLAYLAB_SIGN_IN_ERRORS.find((key) => key === error) ?? null;
  return { demo: isDemoLoginEnabled(), playlab: isPlaylabSignInEnabled(), playlabError };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const next = String(form.get("next") ?? "");

  if (form.get("intent") === "demo") {
    const role = form.get("role");
    if (role !== "admin" && role !== "staff") return data({ error: "auth.demoUnavailable" as const, email: "" }, { status: 400 });
    const result = await demoLogin(request, role);
    if (!result.ok) return data({ error: result.error, email: "" }, { status: isDemoLoginEnabled() ? 503 : 404 });
    return redirect(landingFor(result.user.role, next), { headers: { "Set-Cookie": result.setCookie } });
  }

  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const result = await login(request, email, password);
  if (!result.ok) return data({ error: result.error, email }, { status: result.error === "auth.tooManyAttempts" ? 429 : 400 });
  return redirect(landingFor(result.user.role, next), { headers: { "Set-Cookie": result.setCookie } });
}

/** Easel: the only way in. A plain link, so Playlab's redirect flow starts on the server. */
function PlaylabSignIn({ next, error }: { next: string; error: PlaylabSignInError | null }) {
  const { t } = useT();
  return (
    <div className="mt-8 grid gap-4">
      {error && (
        <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
          {t(error)}
        </p>
      )}
      <Button asChild size="lg" className="w-full">
        <a href={next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login"}>
          <LogIn aria-hidden="true" />
          {t("auth.playlab.button")}
        </a>
      </Button>
      <p className="text-center text-xs text-smoke">{t("auth.playlab.help")}</p>
    </div>
  );
}

/** Demo mode only: one click to sign in as the fictional admin or staff member. */
function DemoButtons({ next, busy }: { next: string; busy: boolean }) {
  const { t } = useT();
  return (
    <section aria-labelledby="demo-title" className="mt-8 grid gap-3 rounded-2xl bg-taupe p-4">
      <div className="grid gap-1 text-center">
        <h2 id="demo-title" className="text-sm font-semibold">
          {t("auth.demoTitle")}
        </h2>
        <p className="text-xs text-smoke">{t("auth.demoHelp")}</p>
      </div>
      {/* Stacked: side by side, "Continue as Administrator" doesn't fit (or "Continuar como administración"). */}
      <div className="grid gap-2">
        {(["admin", "staff"] as const).map((role) => (
          <Form key={role} method="post">
            <input type="hidden" name="intent" value="demo" />
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="outline" className="h-11 w-full bg-canvas" disabled={busy}>
              {role === "admin" ? <ShieldCheck aria-hidden="true" /> : <UserRound aria-hidden="true" />}
              {role === "admin" ? t("auth.demoAdmin") : t("auth.demoStaff")}
            </Button>
          </Form>
        ))}
      </div>
      <p className="text-center text-xs text-smoke">{t("auth.demoOr")}</p>
    </section>
  );
}

export default function Login() {
  const { t } = useT();
  const { demo, playlab, playlabError } = useLoaderData<typeof loader>();
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

        {demo && <DemoButtons next={params.get("next") ?? ""} busy={busy} />}

        {playlab ? (
          <PlaylabSignIn next={params.get("next") ?? ""} error={playlabError} />
        ) : (
          <Form method="post" className={demo ? "mt-4 grid gap-4" : "mt-8 grid gap-4"}>
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
        )}

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
