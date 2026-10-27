/**
 * Email history lists. Verified email (from a connected mailbox) and notes an
 * admin typed by hand look different on purpose: verified mail has a mailbox
 * badge and an envelope; hand-typed notes have a pencil and a "Typed by hand" badge.
 */
import { Link } from "react-router";
import { ArrowDownLeft, ArrowUpRight, PencilLine, Sparkles } from "lucide-react";
import type { DraftView, EmailMessageView, RecentEmailView } from "~/lib/email/store.server";
import { formatDate, formatDateTime, formatDay } from "~/components/admin/format";
import { EmptyState } from "~/components/nva";
import { useT } from "~/i18n";
import { cn } from "~/lib/utils";

function SourceBadge({ viaApp }: { viaApp: boolean }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[0.68rem] font-medium",
        viaApp ? "bg-blue-soft text-blue-ink" : "bg-sage-soft text-sage-ink",
      )}
    >
      {viaApp ? t("email.history.viaApp") : t("email.history.synced")}
    </span>
  );
}

export function EmailMessageList({
  messages,
  showPeople = false,
  empty,
}: {
  messages: (EmailMessageView | RecentEmailView)[];
  showPeople?: boolean;
  empty?: string;
}) {
  const { t, locale } = useT();
  if (!messages.length) return <EmptyState title={empty ?? t("email.history.none")} />;
  return (
    <ul className="grid gap-2">
      {messages.map((m) => {
        const sent = m.direction === "sent";
        const Icon = sent ? ArrowUpRight : ArrowDownLeft;
        const people = "people" in m ? m.people : [];
        return (
          <li key={m.id} className="grid gap-1.5 rounded-card border border-stone bg-canvas p-3.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-smoke">
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-medium",
                  sent ? "text-blue-ink" : "text-purple-ink",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {sent ? t("email.history.sent") : t("email.history.received")}
              </span>
              <SourceBadge viaApp={m.sent_via_app} />
              {m.sent_at && <time dateTime={m.sent_at}>{formatDateTime(m.sent_at, locale)}</time>}
              {m.sent_via_app && m.sent_by_name && <span>{t("email.history.by", { name: m.sent_by_name })}</span>}
            </div>
            <p className="font-medium">{m.subject || t("email.history.noSubject")}</p>
            {m.snippet && <p className="line-clamp-2 text-sm text-graphite">{m.snippet}</p>}
            <p className="text-xs text-smoke">
              {sent ? t("email.history.to", { to: m.to_addresses.join(", ") }) : t("email.history.from", { from: m.from_address ?? "" })}
              {" · "}
              {m.mailbox}
            </p>
            {showPeople && people.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {people.map((p) => (
                  <Link
                    key={p.id}
                    to={`/app/people/${p.id}/email`}
                    className="rounded-full bg-taupe px-2 py-0.5 text-xs font-medium hover:bg-stone"
                  >
                    {p.full_name}
                  </Link>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ManualEmailNotes({
  notes,
}: {
  notes: { id: string; kind: string; happened_on: string; notes: string | null; user_name: string | null }[];
}) {
  const { t, locale, tx } = useT();
  return (
    <ul className="grid gap-2">
      {notes.map((n) => (
        <li key={n.id} className="grid gap-1 rounded-card border border-dashed border-stone p-3.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-smoke">
            <span className="inline-flex items-center gap-1 font-medium text-graphite">
              <PencilLine className="size-3.5" aria-hidden="true" />
              {tx(`common.engagement.${n.kind}`, n.kind)}
            </span>
            <span className="inline-flex h-5 items-center rounded-full bg-stone px-2 text-[0.68rem] font-medium text-smoke">
              {t("email.notes.badge")}
            </span>
            <time dateTime={n.happened_on}>{formatDay(n.happened_on, locale)}</time>
            {n.user_name && <span>{t("email.history.by", { name: n.user_name })}</span>}
          </div>
          {n.notes && <p className="text-sm text-graphite">{n.notes}</p>}
        </li>
      ))}
    </ul>
  );
}

export function DraftList({
  drafts,
  hrefFor,
  currentId,
  showPerson = false,
}: {
  drafts: (DraftView & { person_name?: string })[];
  hrefFor: (d: DraftView) => string;
  currentId?: string | null;
  showPerson?: boolean;
}) {
  const { t, locale } = useT();
  if (!drafts.length) return <EmptyState title={t("email.draft.none")} />;
  return (
    <ul className="grid gap-2">
      {drafts.map((d) => (
        <li key={d.id}>
          <Link
            to={hrefFor(d)}
            className={cn(
              "grid gap-1 rounded-card border bg-canvas p-3.5 transition-colors hover:border-gold/60",
              d.id === currentId ? "border-gold" : "border-stone",
            )}
          >
            <span className="flex flex-wrap items-center gap-2 text-xs text-smoke">
              {showPerson && d.person_name && <span className="font-medium text-graphite">{d.person_name}</span>}
              <span>{t(`email.purpose.${d.purpose}`)}</span>
              {d.ai_generated && (
                <span className="inline-flex items-center gap-1 text-gold-ink">
                  <Sparkles className="size-3" aria-hidden="true" />
                  {t("email.draft.aiBadge")}
                </span>
              )}
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 text-[0.68rem] font-medium",
                  d.status === "sent" ? "bg-sage-soft text-sage-ink" : "bg-gold-soft text-gold-ink",
                )}
              >
                {t(`email.draft.status.${d.status}`)}
              </span>
              <span>{t("email.draft.updated", { date: formatDate(d.updated_at, locale) })}</span>
            </span>
            <span className="truncate font-medium">{d.subject || t("email.history.noSubject")}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
