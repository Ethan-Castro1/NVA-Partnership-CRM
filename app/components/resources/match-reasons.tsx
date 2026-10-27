/**
 * "Why: carpentry, woodworking background; offers practical skills". Renders the
 * reasons searchPeople() returns (search-language.ts), strongest first. Reasons
 * of the same kind share one phrase.
 */
import { useTopicLabel } from "~/components/caps/cap-bits";
import { useT, type MessageKey } from "~/i18n";
import type { MatchReason, MatchReasonKind } from "~/lib/search-language";
import { cn } from "~/lib/utils";

export function MatchReasons({
  reasons,
  max = 3,
  className,
}: {
  reasons: readonly MatchReason[] | undefined;
  /** How many phrases to show at most. */
  max?: number;
  className?: string;
}) {
  const { t } = useT();
  const topicLabel = useTopicLabel();
  if (!reasons?.length) return null;

  // Group values by kind, keeping the order the server ranked them in.
  const groups: { kind: MatchReasonKind; values: string[] }[] = [];
  for (const { kind, value } of reasons) {
    const group = groups.find((g) => g.kind === kind && kind !== "offers");
    if (group) group.values.push(value);
    else groups.push({ kind, values: [value] });
  }

  const phrases = groups.slice(0, max).map(({ kind, values }) => {
    if (kind === "offers") return t(`resources.why.offers.${values[0]}` as MessageKey);
    const shown = kind === "cap" ? values.map(topicLabel) : values;
    return t(`resources.why.${kind}` as MessageKey, { value: shown.join(", ") });
  });

  return (
    <p className={cn("text-xs text-smoke", className)}>
      <span className="font-medium text-graphite">{t("resources.why.label")}</span> {phrases.join("; ")}
    </p>
  );
}
