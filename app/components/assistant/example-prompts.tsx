import { Link } from "react-router";
import { Sparkles } from "lucide-react";
import { useT } from "~/i18n";
import { cn } from "~/lib/utils";
import { EXAMPLE_PROMPTS } from "./types";

/**
 * Suggested questions as pills. Each is a link to /app/ask?q=..., which asks it
 * straight away; on the chat page `onPick` can send it in place instead.
 */
export function ExamplePrompts({
  onPick,
  label,
  className,
}: {
  onPick?: (text: string) => void;
  label: string;
  className?: string;
}) {
  const { t } = useT();
  const pill =
    "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-stone bg-canvas px-3.5 py-1.5 text-left text-sm text-graphite transition-colors hover:border-gold hover:bg-gold-soft focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
  return (
    <ul aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {EXAMPLE_PROMPTS.map((key) => {
        const text = t(`assistant.example.${key}`);
        const body = (
          <>
            <Sparkles className="size-3.5 shrink-0 text-gold-ink" aria-hidden="true" />
            {text}
          </>
        );
        return (
          <li key={key}>
            {onPick ? (
              <button type="button" className={pill} onClick={() => onPick(text)}>
                {body}
              </button>
            ) : (
              <Link to={`/app/ask?q=${encodeURIComponent(text)}`} className={pill}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
