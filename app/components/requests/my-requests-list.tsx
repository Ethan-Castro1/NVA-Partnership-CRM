/**
 * The signed-in staff member's open requests, for the staff dashboard (U1).
 *
 * Props:
 * - requests: listMyActiveRequests(viewer, limit) (open and arranged, soonest first).
 * - title: heading override (defaults to "My open requests").
 * - showNew: show a quiet "New request" link when the list is empty (default true).
 * - className
 *
 *   <MyRequestsList requests={myRequests} />
 */
import { Link } from "react-router";
import { Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import type { RequestView } from "~/lib/requests.server";
import { RequestRows } from "./request-bits";

export type MyRequestsListProps = {
  requests: RequestView[];
  title?: string;
  showNew?: boolean;
  className?: string;
};

export function MyRequestsList({ requests, title, showNew = true, className }: MyRequestsListProps) {
  const { t } = useT();
  return (
    <Panel
      title={title ?? t("requests.mine.title")}
      className={className}
      action={
        <Link to="/app/requests" className="text-sm text-graphite underline-offset-4 hover:text-ink hover:underline">
          {t("requests.mine.viewAll")}
        </Link>
      }
    >
      {requests.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <p className="text-sm text-smoke">{t("requests.mine.empty")}</p>
          {showNew && (
            <Button asChild variant="outline" size="sm">
              <Link to="/app/requests/new">{t("requests.index.new")}</Link>
            </Button>
          )}
        </div>
      ) : (
        <RequestRows requests={requests} />
      )}
    </Panel>
  );
}
