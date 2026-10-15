import { Link } from "react-router";
import { ArrowUpRight, UserPlus } from "lucide-react";
import type { Route } from "./+types/join.thanks";
import { PublicFooter, PublicTopBar, SkipLink } from "~/components/intake/public-shell";
import { VillageOrbs } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT, type Locale, type MessageKey } from "~/i18n";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: Locale } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("intake.thanks.title")} | ${t("common.schoolName")}` }];
};

const NEXT_STEPS: MessageKey[] = ["intake.thanks.next1", "intake.thanks.next2", "intake.thanks.next3"];

/** Shown after a sign-up. Deliberately reads nothing from the URL: no personal data travels here. */
export default function JoinThanks() {
  const { t } = useT();
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,#fff3d1_0%,#fdfcfc_60%)]">
      <SkipLink />
      <PublicTopBar />
      <main id="main" className="flex-1 px-4 pt-4 pb-16 md:pt-10">
        <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <p className="text-script text-3xl text-ink uppercase md:text-4xl">{t("common.weAreTheVillage")}</p>
            <h1 className="text-display">{t("intake.thanks.title")}</h1>
            <p className="max-w-xl text-[1.05rem] leading-relaxed text-smoke">{t("intake.thanks.body")}</p>

            <section aria-labelledby="next-title" className="rounded-[24px] bg-canvas p-6 shadow-whisper md:p-7">
              <h2 id="next-title" className="text-section">
                {t("intake.thanks.nextTitle")}
              </h2>
              <ol className="mt-4 grid gap-4">
                {NEXT_STEPS.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-soft text-sm font-bold text-gold-ink"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <p className="pt-1 text-sm leading-relaxed text-graphite">{t(step)}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="meanwhile-title" className="rounded-card bg-taupe p-6">
              <h2 id="meanwhile-title" className="text-section">
                {t("intake.thanks.meanwhileTitle")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-smoke">{t("intake.thanks.meanwhile")}</p>
            </section>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="brand" size="lg">
                <a href="https://newvillageacademy.org/">
                  {t("intake.thanks.home")}
                  <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/join">
                  <UserPlus aria-hidden="true" />
                  {t("intake.thanks.another")}
                </Link>
              </Button>
            </div>
          </div>
          <div className="hidden justify-center md:flex">
            <VillageOrbs className="max-w-[340px]" />
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
