/**
 * Read-mostly sections of a profile: connections, CAPs and the history
 * timeline, plus the admin-only delete dialog. Admin removals post through
 * fetchers; the route action checks requireAdmin either way.
 */
import { Form, Link, useFetcher, useNavigation, useRouteLoaderData } from "react-router";
import { Trash2, X } from "lucide-react";
import { PersonAvatar } from "~/components/nva";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { useT, type MessageKey } from "~/i18n";
import type { CapPartnerStatus, CapStatus } from "~/lib/constants";
import type { EngagementView, RelationshipView } from "~/lib/people.server";
import { cn } from "~/lib/utils";
import { formatDate, isoDate, withNode } from "./format";

function relationshipKey(rel: RelationshipView): MessageKey {
  switch (rel.kind) {
    case "referred":
      return rel.direction === "out" ? "people.profile.relReferredOut" : "people.profile.relReferredIn";
    case "knows":
      return "people.profile.relKnows";
    case "colleague":
      return "people.profile.relColleague";
    case "family":
      return "people.profile.relFamily";
    default:
      return "people.profile.relOther";
  }
}

/** A small icon button that posts one admin removal. */
function RemoveButton({ intent, targetId, label }: { intent: string; targetId: string; label: string }) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  return (
    <fetcher.Form method="post" className={cn(busy && "opacity-50")}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="target_id" value={targetId} />
      <Button type="submit" variant="ghost" size="icon-sm" disabled={busy} aria-label={label} title={label}>
        <X aria-hidden="true" />
      </Button>
    </fetcher.Form>
  );
}

export function ConnectionsList({ relationships, isAdmin }: { relationships: RelationshipView[]; isAdmin: boolean }) {
  const { t } = useT();
  if (!relationships.length) return <p className="text-sm text-smoke">{t("people.profile.connectionsEmpty")}</p>;
  return (
    <ul className="grid gap-2">
      {relationships.map((rel) => (
        <li key={rel.id} className="flex items-start gap-3 rounded-xl bg-canvas p-3">
          <PersonAvatar name={rel.other.full_name} className="size-8" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-graphite">
              {withNode(
                t(relationshipKey(rel)),
                <Link to={`/app/people/${rel.other.id}`} className="font-medium text-ink underline decoration-stone underline-offset-4 hover:decoration-gold">
                  {rel.other.full_name}
                </Link>,
              )}
            </p>
            {rel.note && <p className="mt-0.5 text-xs text-smoke">{rel.note}</p>}
          </div>
          {isAdmin && (
            <RemoveButton
              intent="removeRelationship"
              targetId={rel.id}
              label={t("people.profile.removeConnection", { name: rel.other.full_name })}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

const PARTNER_STYLE: Record<CapPartnerStatus, string> = {
  suggested: "bg-stone text-graphite",
  contacted: "bg-blue-soft text-blue-ink",
  confirmed: "bg-sage-soft text-sage-ink",
  declined: "bg-rust-soft text-rust-ink",
};

export function CapsList({
  caps,
}: {
  caps: { id: string; title: string; status: CapStatus; partner_status: CapPartnerStatus }[];
}) {
  const { t } = useT();
  if (!caps.length) return <p className="text-sm text-smoke">{t("people.profile.capsEmpty")}</p>;
  return (
    <ul className="grid gap-2">
      {caps.map((cap) => (
        <li key={cap.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas p-3">
          <div className="min-w-0">
            <Link to={`/app/caps/${cap.id}`} className="font-medium text-ink hover:underline">
              {cap.title}
            </Link>
            <p className="text-xs text-smoke">{t(`common.capStatus.${cap.status}`)}</p>
          </div>
          <span
            className={cn("inline-flex h-5 items-center rounded-full px-2 text-[0.7rem] font-medium", PARTNER_STYLE[cap.partner_status])}
          >
            <span className="sr-only">{t("people.profile.partnerStatus")}: </span>
            {t(`common.capPartnerStatus.${cap.partner_status}`)}
          </span>
        </li>
      ))}
    </ul>
  );
}

type EntrySource = "manual" | "email" | "staff" | "request" | "system";

/** Where an entry came from, so manual notes, verified email and staff-logged work look different. */
function entrySource(e: EngagementView, staffAuthored: ReadonlySet<string>): EntrySource {
  if (e.origin === "email") return "email";
  if (e.origin === "staff_request") return "request";
  if (e.origin === "system") return "system";
  return staffAuthored.has(e.id) ? "staff" : "manual";
}

/** Timeline dot colour, and a quiet label only where the source matters (email, staff). */
const SOURCE_STYLE: Record<EntrySource, { dot: string; label: MessageKey | null }> = {
  manual: { dot: "bg-graphite", label: null },
  email: { dot: "bg-blue", label: "people.profile.entryEmail" },
  staff: { dot: "bg-sage", label: "people.profile.entryStaff" },
  request: { dot: "bg-sage", label: "people.profile.entryRequest" },
  system: { dot: "bg-stone", label: null },
};

/**
 * One chronological history. Manual entries read as typed notes, synced email
 * as a quoted snippet marked "Verified email", and work logged by staff (or
 * from a staff request) in sage. Admins can remove manual entries only.
 */
export function HistoryTimeline({
  engagements,
  isAdmin,
  personId,
  staffAuthored = [],
  emptyLabel,
}: {
  engagements: EngagementView[];
  isAdmin: boolean;
  personId: string;
  /** Ids of entries a staff member recorded. */
  staffAuthored?: string[];
  emptyLabel?: string;
}) {
  const { t, locale } = useT();
  const root = useRouteLoaderData("root") as { user?: { name?: string } | null } | undefined;
  const me = root?.user?.name;
  if (!engagements.length) return <p className="text-sm text-smoke">{emptyLabel ?? t("people.profile.historyEmpty")}</p>;
  const staffIds = new Set(staffAuthored);
  return (
    <ol className="relative grid gap-5 border-l border-stone pl-5">
      {engagements.map((e) => {
        const source = entrySource(e, staffIds);
        const style = SOURCE_STYLE[source];
        return (
          <li key={e.id} className="relative">
            <span className={cn("absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-taupe", style.dot)} aria-hidden="true" />
            <div className="flex items-start justify-between gap-2">
              <div className="grid min-w-0 gap-1">
                <p className="text-sm font-medium text-ink">{t(`common.engagement.${e.kind}`)}</p>
                <p className="text-xs text-smoke">
                  <time dateTime={isoDate(e.happened_on)}>{formatDate(e.happened_on, locale)}</time>
                  {e.user_name && e.user_name !== me && <> · {t("people.profile.activityBy", { name: e.user_name })}</>}
                  {style.label && <> · {t(style.label)}</>}
                  {isAdmin && e.visibility === "staff" && <> · {t("people.profile.entryShared")}</>}
                </p>
                {e.cap_id && e.cap_title && (
                  <p className="text-xs text-graphite">
                    {withNode(
                      t("people.profile.activityForCap"),
                      <Link to={`/app/caps/${e.cap_id}`} className="underline underline-offset-4">
                        {e.cap_title}
                      </Link>,
                      "{cap}",
                    )}
                  </p>
                )}
                {e.notes &&
                  (source === "email" ? (
                    <p className="mt-1 border-l-2 border-blue/50 pl-3 text-sm whitespace-pre-line text-graphite italic">{e.notes}</p>
                  ) : (
                    <p
                      className={cn(
                        "mt-1 text-sm whitespace-pre-line text-graphite",
                        source === "manual" && "rounded-xl bg-canvas px-3 py-2",
                      )}
                    >
                      {e.notes}
                    </p>
                  ))}
                {isAdmin && source === "email" && (
                  <Link
                    to={`/app/people/${personId}/email`}
                    className="w-fit text-xs text-smoke underline decoration-stone underline-offset-4 hover:text-ink hover:decoration-gold"
                  >
                    {t("people.profile.openEmail")}
                  </Link>
                )}
              </div>
              {isAdmin && source === "manual" && (
                <RemoveButton intent="deleteEngagement" targetId={e.id} label={t("people.profile.deleteActivity")} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Admin-only. Posts to the profile route's deletePerson intent, so `action` lets it live on the edit page. */
export function DeletePersonDialog({ name, action }: { name: string; action?: string }) {
  const { t } = useT();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting" && navigation.formData?.get("intent") === "deletePerson";
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-rust-ink">
          <Trash2 aria-hidden="true" />
          {t("people.profile.deletePerson")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="rounded-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{t("people.profile.deleteTitle", { name })}</DialogTitle>
          <DialogDescription>{t("people.profile.deleteBody")}</DialogDescription>
        </DialogHeader>
        <Form method="post" action={action}>
          <input type="hidden" name="intent" value="deletePerson" />
          <DialogFooter className="rounded-b-card">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("common.action.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? t("people.profile.deleting") : t("people.profile.deleteConfirm")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
