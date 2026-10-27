/** Small CAP pieces shared by the list, form and detail pages. */
import { Link } from "react-router";
import { CalendarDays, UserRound, Users } from "lucide-react";
import { Sheet, TagList } from "~/components/nva";
import { useT, type TFunction } from "~/i18n";
import type { CapStatus } from "~/lib/constants";
import { BLOCK_DAYS, catalogCap, capTopicShort, type CapBlock, type CapLabel } from "~/lib/cap-catalog";
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

/** Topics are stored as keys: this semester's CAPs show by their short title, older ones translated, typed ones as typed. */
export function useTopicLabel(): (topic: string) => string {
  const { tx } = useT();
  return (topic) => (catalogCap(topic) ? capTopicShort(topic) : tx(`caps.topic.${topic}`, topic));
}

export function TopicList({ topics, className }: { topics: string[]; className?: string }) {
  const label = useTopicLabel();
  return <TagList tags={topics.map(label)} className={className} />;
}

/** "Block A · Mon and Fri" chips. */
export function BlockChips({ blocks, className }: { blocks: CapBlock[]; className?: string }) {
  const { t } = useT();
  if (!blocks.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {blocks.map((block) => (
        <li key={block} className="inline-flex h-6 items-center gap-1 rounded-full bg-blue-soft px-2.5 text-xs text-blue-ink">
          <span className="font-semibold">{t("caps.block.name", { block })}</span>
          <span aria-hidden="true">·</span>
          {t(`caps.days.${BLOCK_DAYS[block]}`)}
        </li>
      ))}
    </ul>
  );
}

export function CapLabels({ labels, className }: { labels: CapLabel[]; className?: string }) {
  const { t } = useT();
  if (!labels.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {labels.map((label) => (
        <li
          key={label}
          className={cn(
            "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium",
            label === "bilingual" ? "bg-rust-soft text-rust-ink" : "bg-sage-soft text-sage-ink",
          )}
        >
          {t(`caps.label.${label}`)}
        </li>
      ))}
    </ul>
  );
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
      <div className="grid gap-2">
        <BlockChips blocks={cap.blocks} />
        <CapLabels labels={cap.labels} />
      </div>
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
          <span>{cap.teacher || (cap.owner_name ? t("caps.card.owner", { name: cap.owner_name }) : t("caps.card.noOwner"))}</span>
        </div>
      </div>
    </Sheet>
  );
}

/** "3 partners" or "3 partners, 1 confirmed"; nothing when there are none. */
function partnerSummary(t: TFunction, total: number, confirmed: number): string | null {
  if (!total) return null;
  if (total === 1) return confirmed ? t("caps.card.partnerCountOneConfirmed") : t("caps.card.partnerCountOne");
  return confirmed
    ? t("caps.card.partnerCountConfirmed", { count: total, confirmed })
    : t("caps.card.partnerCount", { count: total });
}

/** CAPs as a compact list: title over teacher, blocks and labels, with the status and partners on the right. */
export function CapRows({ caps }: { caps: CapSummary[] }) {
  const { t } = useT();
  return (
    <ul className="divide-y divide-stone">
      {caps.map((cap) => {
        const days = cap.blocks.map((b) => `${t("caps.block.name", { block: b })} ${t(`caps.days.${BLOCK_DAYS[b]}`)}`).join(", ");
        const meta = [cap.teacher || cap.owner_name, days, ...cap.labels.map((l) => t(`caps.label.${l}`))].filter(Boolean);
        const partners = partnerSummary(t, cap.partner_count, cap.confirmed_count);
        return (
          <li key={cap.id} className="flex items-center gap-3 py-3">
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
              <Link to={`/app/caps/${cap.id}`} className="min-w-0 font-medium underline-offset-4 hover:underline">
                {cap.title}
              </Link>
              <p className="truncate text-xs text-smoke">{meta.join(" · ")}</p>
            </div>
            {(partners || cap.status !== "active") && (
              <div className="flex shrink-0 flex-col items-end gap-1 text-right max-sm:max-w-[5.5rem]">
                {cap.status !== "active" && <CapStatusBadge status={cap.status} />}
                {partners && <span className={cn("text-xs", cap.confirmed_count ? "text-sage-ink" : "text-smoke")}>{partners}</span>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
