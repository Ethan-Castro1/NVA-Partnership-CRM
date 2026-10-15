/** /home: a short welcome. One line about NVA, the ways to help, and the way in. */
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import type { Route } from "./+types/home";
import { PublicFooter, PublicTopBar, SkipLink } from "~/components/intake/public-shell";
import { FullLogo } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { CONTRIBUTION_COLOR, PUBLIC_CONTRIBUTION_TYPES } from "~/lib/constants";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [
    { title: `${t("public.title")} | ${t("common.schoolName")}` },
    { name: "description", content: t("public.description") },
  ];
};

export default function Home() {
  const { t } = useT();
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SkipLink />
      <PublicTopBar />
      <main id="main" className="flex flex-1 items-center px-4 py-10 md:px-8">
        <div className="mx-auto grid w-full max-w-2xl justify-items-center gap-6 text-center">
          <FullLogo className="max-w-[320px]" />
          <p className="text-script text-3xl uppercase md:text-4xl">{t("common.classroomTagline")}</p>
          <p className="max-w-lg text-[1.05rem] leading-relaxed text-smoke">{t("public.homeBody")}</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {PUBLIC_CONTRIBUTION_TYPES.map((type) => (
              <li key={type} className="inline-flex h-9 items-center gap-2 rounded-full border border-stone px-3.5 text-sm text-graphite">
                <span className={cn("size-2.5 rounded-full", CONTRIBUTION_COLOR[type].dot)} aria-hidden="true" />
                {t(`common.contribution.${type}`)}
              </li>
            ))}
          </ul>
          <Button asChild variant="brand" size="lg">
            <Link to="/join">
              {t("common.nav.join")}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
