import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import type { Route } from "./+types/home";
import { PublicFooter, PublicTopBar, SkipLink } from "~/components/intake/public-shell";
import { VillageOrbs } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT, type MessageKey } from "~/i18n";
import { CONTRIBUTION_COLOR, CONTRIBUTION_TYPES } from "~/lib/constants";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [
    { title: `${t("public.title")} | ${t("common.schoolName")}` },
    { name: "description", content: t("public.description") },
  ];
};

const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: "public.step1Title", body: "public.step1Body" },
  { title: "public.step2Title", body: "public.step2Body" },
  { title: "public.step3Title", body: "public.step3Body" },
];

const NORMS: MessageKey[] = ["public.norm1", "public.norm2", "public.norm3", "public.norm4", "public.norm5"];

export default function Home() {
  const { t } = useT();

  return (
    <div className="min-h-screen bg-canvas">
      <SkipLink />
      <PublicTopBar />

      <main id="main">
        {/* Hero: copy on the left, the village orbs on the right (desktop). */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-16 md:grid-cols-[1.3fr_1fr] md:px-8 md:pt-16 md:pb-24">
          <div className="space-y-6">
            <p className="text-eyebrow text-gold-ink">{t("common.classroomTagline")}</p>
            <h1 className="text-display md:text-[3.5rem] md:leading-[1.04]">{t("public.heroTitle")}</h1>
            <p className="max-w-xl text-[1.05rem] leading-relaxed text-smoke">{t("public.heroBody")}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="lg">
                <Link to="/join">
                  {t("common.nav.join")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <a href="#how">{t("public.heroSecondary")}</a>
              </Button>
            </div>
          </div>
          <div className="hidden justify-center md:flex">
            <VillageOrbs />
          </div>
        </section>

        {/* The four ways to help, each in its brand colour. */}
        <section aria-labelledby="ways-title" className="mx-auto max-w-6xl px-4 pb-16 md:px-8 md:pb-24">
          <div className="mb-8 max-w-2xl space-y-2">
            <p className="text-eyebrow text-gold-ink">{t("public.waysEyebrow")}</p>
            <h2 id="ways-title" className="text-heading">
              {t("public.waysTitle")}
            </h2>
            <p className="text-smoke">{t("public.waysBody")}</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CONTRIBUTION_TYPES.map((type) => (
              <li key={type} className="flex flex-col gap-3 rounded-card bg-taupe p-6">
                <span className={cn("size-3 rounded-full", CONTRIBUTION_COLOR[type].dot)} aria-hidden="true" />
                <h3 className="text-section">{t(`common.contributionLong.${type}`)}</h3>
                <p className="text-sm leading-relaxed text-smoke">{t(`common.contributionHelp.${type}`)}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works. */}
        <section id="how" aria-labelledby="how-title" className="scroll-mt-6 border-t border-stone">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
            <div className="mb-10 max-w-2xl space-y-2">
              <p className="text-eyebrow text-gold-ink">{t("public.howEyebrow")}</p>
              <h2 id="how-title" className="text-heading">
                {t("public.howTitle")}
              </h2>
            </div>
            <ol className="grid gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-soft font-display text-lg font-bold text-gold-ink"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="space-y-1.5">
                    <h3 className="text-section">{t(step.title)}</h3>
                    <p className="text-sm leading-relaxed text-smoke">{t(step.body)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The village band: brand accent script and the five school norms. */}
        <section aria-labelledby="village-title" className="bg-gold">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-14 md:flex-row md:items-center md:justify-between md:px-8">
            <div className="space-y-5">
              <h2 id="village-title" className="text-script text-4xl text-ink uppercase md:text-5xl">
                {t("common.weAreTheVillage")}
              </h2>
              <div>
                <p className="mb-2 text-eyebrow text-ink">{t("public.normsLabel")}</p>
                <ul className="flex flex-wrap gap-x-5 gap-y-2 font-display text-lg font-semibold text-ink">
                  {NORMS.map((norm) => (
                    <li key={norm}>{t(norm)}</li>
                  ))}
                </ul>
              </div>
            </div>
            <Button asChild size="lg" className="self-start md:self-center">
              <Link to="/join">
                {t("public.bandCta")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
