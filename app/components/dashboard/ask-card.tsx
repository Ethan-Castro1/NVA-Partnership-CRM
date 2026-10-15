import { Form } from "react-router";
import { Search, Sparkles } from "lucide-react";
import { ExamplePrompts } from "~/components/assistant/example-prompts";
import { MAX_MESSAGE_CHARS } from "~/components/assistant/types";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";

/** The dashboard's main call to action: a question box that opens the assistant. */
export function AskCard() {
  const { t } = useT();
  return (
    <section
      aria-labelledby="ask-heading"
      className="relative overflow-hidden rounded-card bg-[radial-gradient(ellipse_at_top_right,#fff3d1_0%,#fdfcfc_60%)] p-5 shadow-whisper ring-1 ring-stone md:p-8"
    >
      <div className="relative grid gap-4">
        <div className="space-y-1">
          <p id="ask-heading" className="text-eyebrow text-gold-ink">
            {t("dashboard.askTitle")}
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight md:text-[1.75rem]">
            <label htmlFor="ask-q">{t("dashboard.askLabel")}</label>
          </h2>
          <p className="text-sm text-smoke">{t("dashboard.askHint")}</p>
        </div>
        <Form method="get" action="/app/ask" className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-smoke" aria-hidden="true" />
            <input
              id="ask-q"
              name="q"
              required
              maxLength={MAX_MESSAGE_CHARS}
              autoComplete="off"
              placeholder={t("dashboard.askPlaceholder")}
              className="h-12 w-full rounded-full border border-stone bg-canvas pr-4 pl-11 text-base outline-none placeholder:text-smoke focus-visible:border-gold focus-visible:ring-3 focus-visible:ring-ring/40"
            />
          </div>
          <Button type="submit" variant="brand" size="lg" className="h-12">
            <Sparkles aria-hidden="true" />
            {t("dashboard.askSubmit")}
          </Button>
        </Form>
        <div className="grid gap-2">
          <p className="text-xs text-smoke">{t("dashboard.examplesLabel")}</p>
          <ExamplePrompts label={t("dashboard.examplesLabel")} />
        </div>
      </div>
    </section>
  );
}
