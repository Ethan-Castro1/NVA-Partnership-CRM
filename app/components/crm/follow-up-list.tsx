/**
 * A list of follow-ups with their actions: mark done, reschedule, mark done
 * and add the next step, waiting on a reply, cancel. Every action posts with
 * a fetcher to /app/follow-ups/action (admin only), so it saves in place and
 * the page's loaders refresh.
 *
 * Props:
 * - items: FollowUpItem[] from listFollowUps / getPersonCrm (follow-ups.server.ts).
 * - today: schoolToday() from the loader (YYYY-MM-DD), so server and browser agree.
 * - showPerson (default true): show the person's name and link. Turn off on a profile.
 * - showOpportunity (default true): show the linked opportunity. Turn off on an opportunity page.
 * - empty: what to show when there are none (default: "No follow-ups.").
 * - className
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { CalendarClock, Check, Circle, Hourglass, Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useT, type MessageKey } from "~/i18n";
import { addDays } from "~/lib/dates";
import type { FollowUpItem } from "~/lib/follow-ups.server";
import { cn } from "~/lib/utils";
import { crmDate, daysOverdue, useMyId } from "./crm-bits";

export const FOLLOW_UP_ACTION = "/app/follow-ups/action";

export type FollowUpActionResult = {
  ok: boolean;
  id?: string;
  error?: MessageKey;
  errors?: Partial<Record<string, MessageKey>>;
};

export type FollowUpListProps = {
  items: FollowUpItem[];
  today: string;
  showPerson?: boolean;
  showOpportunity?: boolean;
  empty?: ReactNode;
  className?: string;
};

export function FollowUpList({ items, today, showPerson = true, showOpportunity = true, empty, className }: FollowUpListProps) {
  const { t } = useT();
  if (!items.length) {
    return <p className={cn("py-3 text-sm text-smoke", className)}>{empty ?? t("crm.fu.empty.any")}</p>;
  }
  return (
    <ul className={cn("divide-y divide-stone", className)}>
      {items.map((item) => (
        <FollowUpRow key={item.id} item={item} today={today} showPerson={showPerson} showOpportunity={showOpportunity} />
      ))}
    </ul>
  );
}

/** Non-empty parts joined with " · ". */
function joinDots(parts: ReactNode[]): ReactNode[] {
  return parts.filter(Boolean).flatMap((part, i) => (i ? [" · ", part] : [part]));
}

function DueLabel({ item, today }: { item: FollowUpItem; today: string }) {
  const { t, locale } = useT();
  if (item.status === "completed") return null;
  const overdue = daysOverdue(item.due_on, today);
  if (item.due_on === today) return <span className="font-medium text-gold-ink">{t("crm.fu.row.dueToday")}</span>;
  if (overdue > 0) {
    return (
      <span className="font-medium text-rust-ink" title={t("crm.fu.row.due", { date: crmDate(item.due_on, locale, today) })}>
        {overdue === 1 ? t("crm.fu.row.overdueOne") : t("crm.fu.row.overdue", { count: overdue })}
      </span>
    );
  }
  return <span className="text-graphite">{t("crm.fu.row.due", { date: crmDate(item.due_on, locale, today) })}</span>;
}

function FollowUpRow({
  item,
  today,
  showPerson,
  showOpportunity,
}: {
  item: FollowUpItem;
  today: string;
  showPerson: boolean;
  showOpportunity: boolean;
}) {
  const { t, locale } = useT();
  const me = useMyId();
  const complete = useFetcher<FollowUpActionResult>();
  const other = useFetcher<FollowUpActionResult>();
  const [mode, setMode] = useState<null | "reschedule" | "next">(null);
  const done = item.status === "completed";
  const completing = complete.state !== "idle";
  const busy = completing || other.state !== "idle";
  const error = (complete.state === "idle" && complete.data?.ok === false && complete.data) || (other.state === "idle" && other.data?.ok === false && other.data);

  // Close the inline form once its change saved.
  useEffect(() => {
    if (other.state === "idle" && other.data?.ok) setMode(null);
  }, [other.state, other.data]);
  useEffect(() => {
    if (complete.state === "idle" && complete.data?.ok) setMode(null);
  }, [complete.state, complete.data]);

  const post = (fields: Record<string, string>) => other.submit({ id: item.id, ...fields }, { method: "post", action: FOLLOW_UP_ACTION });

  // A short "Marked done" / "Moved to Nov 3" once the change saves. Fired as soon as the action
  // answers (while the lists reload), because a finished row can leave the list right after.
  const toasted = useRef<object | null>(null);
  const rescheduledTo = useRef<string | null>(null);
  if (other.formData?.get("intent") === "reschedule") rescheduledTo.current = String(other.formData.get("dueOn") ?? "");
  useEffect(() => {
    if (complete.state !== "submitting" && complete.data?.ok && toasted.current !== complete.data) {
      toasted.current = complete.data;
      toast.success(t("crm.fu.toast.done"));
    }
  }, [complete.state, complete.data, t]);
  useEffect(() => {
    if (other.state !== "submitting" && other.data?.ok && toasted.current !== other.data && rescheduledTo.current) {
      toasted.current = other.data;
      toast.success(t("crm.fu.toast.moved", { date: crmDate(rescheduledTo.current, locale, today) }));
      rescheduledTo.current = null;
    }
  }, [other.state, other.data, t, locale, today]);

  return (
    <li className={cn("py-3.5", completing && "opacity-60")}>
      <div className="flex items-start gap-3">
        {done ? (
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-sage-soft text-sage-ink" aria-hidden="true">
            <Check className="size-4" />
          </span>
        ) : (
          <complete.Form method="post" action={FOLLOW_UP_ACTION} className="shrink-0">
            <input type="hidden" name="intent" value="complete" />
            <input type="hidden" name="id" value={item.id} />
            <button
              type="submit"
              disabled={busy}
              title={t("crm.fu.action.complete")}
              aria-label={t("crm.fu.action.completeLabel", { action: item.action })}
              className="group mt-0.5 grid size-7 place-items-center rounded-full text-ash transition-colors hover:bg-sage-soft hover:text-sage-ink focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
            >
              {completing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <Circle className="size-5 group-hover:hidden" aria-hidden="true" />
                  <Check className="hidden size-4 group-hover:block" aria-hidden="true" />
                </>
              )}
            </button>
          </complete.Form>
        )}

        <div className="min-w-0 flex-1">
          <p className={cn("text-[0.95rem] leading-snug", done ? "text-graphite" : "font-medium text-ink")}>{item.action}</p>
          <p className="mt-0.5 truncate text-xs text-smoke">
            {joinDots([
              item.awaiting_response && !done && (
                <span key="a" className="inline-flex items-center gap-1 font-medium text-purple-ink">
                  <Hourglass className="size-3" aria-hidden="true" />
                  {t("crm.fu.row.awaiting")}
                </span>
              ),
              showPerson && (
                <Link key="p" to={`/app/people/${item.person_id}`} className="font-medium text-graphite underline-offset-4 hover:text-ink hover:underline">
                  {item.person_name}
                  {item.organization_name && <span className="font-normal text-smoke">, {item.organization_name}</span>}
                </Link>
              ),
              showOpportunity && item.opportunity_id && item.opportunity_title && (
                <Link key="o" to={`/app/opportunities/${item.opportunity_id}`} className="underline-offset-4 hover:text-ink hover:underline">
                  {item.opportunity_title}
                </Link>
              ),
              done
                ? item.completed_by_name
                  ? t("crm.fu.row.doneBy", { date: crmDate(item.completed_at, locale, today), name: item.completed_by_name })
                  : t("crm.fu.row.doneOn", { date: crmDate(item.completed_at, locale, today) })
                : item.owner_user_id !== me && item.owner_name,
            ])}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs">
          <DueLabel item={item} today={today} />
          {!done && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-expanded={mode === "reschedule"}
              aria-label={t("crm.fu.action.rescheduleLabel", { action: item.action })}
              title={t("crm.fu.action.reschedule")}
              onClick={() => setMode(mode === "reschedule" ? null : "reschedule")}
              className="text-graphite max-sm:size-10 max-sm:px-0"
            >
              <CalendarClock aria-hidden="true" />
              <span className="max-sm:sr-only">{t("crm.fu.action.reschedule")}</span>
            </Button>
          )}
          {!done && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={t("crm.fu.action.more")} title={t("crm.fu.action.more")}>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onSelect={() => setMode("next")}>
                  <Check aria-hidden="true" />
                  {t("crm.fu.action.completeAndNext")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => post({ intent: "awaiting", awaiting: item.awaiting_response ? "false" : "true" })}>
                  <Hourglass aria-hidden="true" />
                  {item.awaiting_response ? t("crm.fu.action.unmarkAwaiting") : t("crm.fu.action.markAwaiting")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => post({ intent: "cancel" })}>
                  {t("crm.fu.action.cancel")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {mode === "reschedule" && (
        <other.Form method="post" action={FOLLOW_UP_ACTION} className="mt-3 ml-10 flex flex-wrap items-end gap-2 rounded-xl bg-taupe p-3">
          <input type="hidden" name="intent" value="reschedule" />
          <input type="hidden" name="id" value={item.id} />
          <div className="grid gap-1">
            <Label htmlFor={`due-${item.id}`} className="text-xs text-smoke">
              {t("crm.fu.action.newDate")}
            </Label>
            <Input id={`due-${item.id}`} type="date" name="dueOn" required defaultValue={item.due_on < today ? today : item.due_on} className="h-9 w-40 bg-canvas" />
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => post({ intent: "reschedule", dueOn: addDays(today, 1) })}>
            {t("crm.fu.action.tomorrow")}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => post({ intent: "reschedule", dueOn: addDays(today, 7) })}>
            {t("crm.fu.action.nextWeek")}
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {t("crm.fu.action.save")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)}>
            {t("crm.fu.action.close")}
          </Button>
        </other.Form>
      )}

      {mode === "next" && (
        <complete.Form method="post" action={FOLLOW_UP_ACTION} className="mt-3 ml-10 grid gap-2 rounded-xl bg-taupe p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
          <input type="hidden" name="intent" value="complete" />
          <input type="hidden" name="id" value={item.id} />
          <div className="grid gap-1">
            <Label htmlFor={`next-${item.id}`} className="text-xs text-smoke">
              {t("crm.fu.action.nextStep")}
            </Label>
            <Input id={`next-${item.id}`} name="nextAction" required maxLength={500} placeholder={t("crm.fu.form.actionPlaceholder")} className="h-9 bg-canvas" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`next-due-${item.id}`} className="text-xs text-smoke">
              {t("crm.fu.form.dueOn")}
            </Label>
            <Input id={`next-due-${item.id}`} type="date" name="nextDueOn" required defaultValue={addDays(today, 7)} className="h-9 bg-canvas" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {t("crm.fu.action.saveNext")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)}>
              {t("crm.fu.action.close")}
            </Button>
          </div>
        </complete.Form>
      )}

      {error && (
        <p role="alert" className="mt-2 ml-10 text-xs font-medium text-destructive">
          {t(error.error ?? "crm.fu.action.failed")}
        </p>
      )}
    </li>
  );
}
