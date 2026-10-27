import { useT } from "~/i18n";
import { cn } from "~/lib/utils";
import { EXAMPLE_PROMPTS } from "./types";

/** Suggested questions as plain pills in an empty chat; picking one asks it. */
export function ExamplePrompts({
  onPick,
  label,
  className,
}: {
  onPick: (text: string) => void;
  label: string;
  className?: string;
}) {
  const { t } = useT();
  const pill =
    "inline-flex min-h-10 items-center rounded-full border border-stone bg-canvas px-3.5 py-1.5 text-left text-sm text-graphite transition-colors hover:border-gold hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
  return (
    <ul aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {EXAMPLE_PROMPTS.map((key) => {
        const text = t(`assistant.example.${key}`);
        return (
          <li key={key}>
            <button type="button" className={pill} onClick={() => onPick(text)}>
              {text}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
