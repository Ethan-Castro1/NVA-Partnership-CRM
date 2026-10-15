/** Small CAP pieces shared by the list, form and detail pages. */
import { Link } from "react-router";
import { CalendarDays, UserRound, Users } from "lucide-react";
import { Sheet, TagList } from "~/components/nva";
import { useT } from "~/i18n";
import type { CapStatus } from "~/lib/constants";
import type { CapSummary } from "~/lib/caps.server";
import { cn } from "~/lib/utils";

const CAP_STATUS_STYLE: Record<CapStatus, string> = {
  planning: "bg-gold-soft text-gold-ink",
  active: "bg-sage-soft text-sage-ink",
  complete: "bg-stone text-smoke",
};

export function CapStatusBadge({ status, className }: { status: CapStatus; className?: string }) {
  const { t } = useT();
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[0.7rem] font-medium", CAP_STATUS_STYLE[status], className)}>
      {t(`common.capStatus.${status}`)}
    </span>
  );
}

/** Topics are stored as English keys; suggested ones have translated labels, typed ones show as typed. */
export function useTopicLabel(): (topic: string) => string {
  const { tx } = useT();
  return (topic) => tx(`caps.topic.${topic}`, topic);
}

export function TopicList({ topics, className }: { topics: string[]; className?: string }) {
  const label = useTopicLabel();
  return <TagList tags={topics.map(label)} className={className} />;
}

export function CapCard({ cap }: { cap: CapSummary }) {
  const { t } = useT();
  const pct = cap.partner_count ? Math.round((cap.confirmed_count / cap.partner_count) * 100) : 0;
  return (
    <Sheet className="relative flex h-full flex-col gap-4 transition-shadow focus-within:ring-3 focus-within:ring-ring/50 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]">
      <div className="flex flex-wrap items-center gap-2">
        <CapStatusBadge status={cap.status} />
        {cap.term && (
          <span className="inline-flex items-center gap-1 text-xs text-smoke">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {cap.term}
          </span>
        )}
      </div>
      <div className="space-y-2">
        <h2 className="font-display text-xl font-bold tracking-tight">
          <Link to={`/app/caps/${cap.id}`} className="outline-none after:absolute after:inset-0 after:rounded-card hover:underline">
            {cap.title}
          </Link>
        </h2>
        <p className={cn("line-clamp-3 text-sm", cap.driving_question ? "text-graphite" : "text-smoke italic")}>
          {cap.driving_question ?? t("caps.card.noQuestion")}
        </p>
      </div>
      <TopicList topics={cap.topics} />
      <div className="mt-auto grid gap-2 border-t border-stone pt-3 text-xs text-smoke">
        <div className="flex items-center gap-2">
          <Users className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{t("caps.card.partners", { confirmed: cap.confirmed_count, total: cap.partner_count })}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone" aria-hidden="true">
          <div className="h-full rounded-full bg-sage" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-2">
          <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{cap.owner_name ? t("caps.card.owner", { name: cap.owner_name }) : t("caps.card.noOwner")}</span>
        </div>
      </div>
    </Sheet>
  );
}
