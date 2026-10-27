/**
 * Email history lists, two lines a row. Email from a connected mailbox shows a
 * sent or received arrow; notes an admin typed by hand show a pencil.
 */
import { Link } from "react-router";
import { ArrowDownLeft, ArrowUpRight, PencilLine } from "lucide-react";
import type { DraftView, EmailMessageView, RecentEmailView } from "~/lib/email/store.server";
import { formatDate, formatDateTime, formatDay } from "~/components/admin/format";
import { useT } from "~/i18n";
import { cn } from "~/lib/utils";

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
  if (!messages.length) return <p className="text-sm text-smoke">{empty ?? t("email.history.none")}</p>;
  return (
    <ul className="divide-y divide-stone">
      {messages.map((m) => {
        const sent = m.direction === "sent";
        const Icon = sent ? ArrowUpRight : ArrowDownLeft;
        const people = "people" in m ? m.people : [];
        return (
          <li key={m.id} className="grid grid-cols-[minmax(0,1fr)] gap-0.5 py-3" title={m.snippet ?? undefined}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate font-medium">{m.subject || t("email.history.noSubject")}</p>
              {m.sent_at && (
                <time dateTime={m.sent_at} className="shrink-0 text-xs text-smoke">
                  {formatDateTime(m.sent_at, locale)}
                </time>
              )}
            </div>
            <p className="truncate text-xs text-smoke">
              <span className={cn("mr-1.5 inline-flex items-center gap-1 font-medium", sent ? "text-blue-ink" : "text-purple-ink")}>
                <Icon className="size-3.5" aria-hidden="true" />
                {sent ? t("email.history.sent") : t("email.history.received")}
              </span>
              {showPeople && people.length > 0
                ? people.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && ", "}
                      <Link to={`/app/people/${p.id}/email`} className="text-graphite underline-offset-4 hover:text-ink hover:underline">
                        {p.full_name}
                      </Link>
                    </span>
                  ))
                : sent
                  ? t("email.history.to", { to: m.to_addresses.join(", ") })
                  : t("email.history.from", { from: m.from_address ?? "" })}
              {m.sent_via_app && m.sent_by_name && <> · {t("email.history.by", { name: m.sent_by_name })}</>}
            </p>
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
  if (!drafts.length) return <p className="text-sm text-smoke">{t("email.draft.none")}</p>;
  return (
    <ul className="divide-y divide-stone">
      {drafts.map((d) => (
        <li key={d.id}>
          <Link
            to={hrefFor(d)}
            aria-current={d.id === currentId ? "true" : undefined}
            className={cn(
              "group grid grid-cols-[minmax(0,1fr)] gap-0.5 rounded-md py-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              d.id === currentId && "font-medium",
            )}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0 truncate font-medium group-hover:underline">{d.subject || t("email.history.noSubject")}</span>
              <span
                className={cn(
                  "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[0.68rem] font-medium",
                  d.status === "sent" ? "bg-sage-soft text-sage-ink" : "bg-gold-soft text-gold-ink",
                )}
              >
                {t(`email.draft.status.${d.status}`)}
              </span>
            </span>
            <span className="truncate text-xs font-normal text-smoke">
              {[showPerson ? d.person_name : null, t(`email.purpose.${d.purpose}`), t("email.draft.updated", { date: formatDate(d.updated_at, locale) })]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
