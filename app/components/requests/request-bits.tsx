/**
 * Small shared pieces for the staff request screens: the status pill, the
 * "Introduction" tag, a "when" label, a native select styled like Input, and
 * the compact request rows used by MyRequestsList and RequestsPanel.
 */
import { Link } from "react-router";
import { Handshake } from "lucide-react";
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
        return (
          <li key={r.id} className="py-3 first:pt-0 last:pb-0">
            <Link
              to={`/app/requests/${r.id}`}
              className="group grid gap-1 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium group-hover:underline">{r.need}</span>
                <RequestStatusBadge status={r.status} />
                {r.kind === "introduction" && <IntroTag />}
              </span>
              <span className="flex flex-wrap gap-x-3 text-xs text-smoke">
                {showRequester && <span>{t("requests.detail.from", { name: r.requester_name })}</span>}
                {when && <span>{when}</span>}
                {names && <span>{t("requests.item.with", { names })}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
