/**
 * Small shared pieces for the staff request screens: the status pill, the
 * "Introduction" and "Shared by" tags, a "when" label, a native select styled like Input, and
 * the compact request rows used by MyRequestsList and RequestsPanel.
 */
import { Link } from "react-router";
import { Handshake, Users } from "lucide-react";
import type { ComponentProps } from "react";
import { formatDate } from "~/components/people/format";
import { useT, type Locale } from "~/i18n";
import type { RequestStatus } from "~/lib/constants";
import type { RequestView } from "~/lib/requests.server";
import { cn } from "~/lib/utils";

const STATUS_STYLE: Record<RequestStatus, string> = {
  open: "bg-gold-soft text-gold-ink",
  arranged: "bg-blue-soft text-blue-ink",
  completed: "bg-sage-soft text-sage-ink",
  canceled: "bg-stone text-smoke",
};

export function RequestStatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  const { t } = useT();
  return (
    <span
      title={t(`common.requestStatusHelp.${status}`)}
      className={cn("inline-flex h-5 items-center rounded-full px-2 text-[0.7rem] font-medium whitespace-nowrap", STATUS_STYLE[status], className)}
    >
      {t(`common.requestStatus.${status}`)}
    </span>
  );
}

export function IntroTag({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border border-stone px-2 text-[0.7rem] text-graphite", className)}>
      <Handshake className="size-3" aria-hidden="true" />
      {t("requests.item.intro")}
    </span>
  );
}

/** The preferred date, else the timeframe, else "". */
export function requestWhen(request: Pick<RequestView, "preferred_date" | "timeframe">, locale: Locale): string {
  if (request.preferred_date) return formatDate(request.preferred_date, locale);
  return request.timeframe ?? "";
}

/** A native select that looks like Input (posts with its form, no client JS needed). */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-canvas px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Compact request rows: need, status, when and who. Each row links to the request.
 * `showRequester` adds "From {name}" (admin views).
 */
/** "Shared by Ana": someone else's request a colleague shared with the viewer. */
export function SharedTag({ name, className }: { name: string; className?: string }) {
  const { t } = useT();
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border border-stone px-2 text-[0.7rem] text-graphite", className)}>
      <Users className="size-3" aria-hidden="true" />
      {t("requests.share.sharedBy", { name })}
    </span>
  );
}

export function RequestRows({
  requests,
  showRequester = false,
  className,
}: {
  requests: RequestView[];
  showRequester?: boolean;
  className?: string;
}) {
  const { t, locale } = useT();
  return (
    <ul className={cn("divide-y divide-stone", className)}>
      {requests.map((r) => {
        const when = requestWhen(r, locale);
        const names = r.people.map((p) => p.full_name).join(", ");
        const meta = [
          showRequester ? t("requests.detail.from", { name: r.requester_name }) : null,
          r.shared_with_me && !showRequester ? t("requests.share.sharedBy", { name: r.requester_name }) : null,
          when || null,
          names ? t("requests.item.with", { names }) : null,
        ].filter(Boolean);
        return (
          <li key={r.id} className="py-3 first:pt-0 last:pb-0">
            <Link
              to={`/app/requests/${r.id}`}
              className="group grid grid-cols-[minmax(0,1fr)] gap-0.5 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 font-medium group-hover:underline">{r.need}</span>{" "}
                <RequestStatusBadge status={r.status} className="mt-0.5 shrink-0" />
              </span>
              <span className="truncate text-xs text-smoke">
                {r.kind === "introduction" && (
                  <span className="inline-flex items-center gap-1 font-medium text-graphite">
                    <Handshake className="size-3" aria-hidden="true" />
                    {t("requests.item.intro")}
                  </span>
                )}
                {r.kind === "introduction" && meta.length > 0 && " · "}
                {meta.join(" · ")}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
