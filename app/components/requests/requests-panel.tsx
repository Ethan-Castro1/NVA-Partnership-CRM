/**
 * A person's related staff requests, for the contact profile (U2b).
 *
 * Props:
 * - personId: the person on the profile (the "New request" link pre-fills them).
 * - requests: listRequestsForPerson(viewer, personId). The server already
 *   scopes it: admins get every request with this person, staff only their own.
 * - showRequester: show "From {name}" on each row (pass true for admins).
 * - className
 *
 *   <RequestsPanel personId={person.id} requests={requests} showRequester={isAdmin} />
 */
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import type { RequestView } from "~/lib/requests.server";
import { RequestRows } from "./request-bits";

export type RequestsPanelProps = {
  personId: string;
  requests: RequestView[];
  showRequester?: boolean;
  className?: string;
};

export function RequestsPanel({ personId, requests, showRequester = false, className }: RequestsPanelProps) {
  const { t } = useT();
  return (
    <Panel
      title={t("requests.panel.title")}
      className={className}
      action={
        <Button asChild variant="outline" size="sm">
          <Link to={`/app/requests/new?person=${encodeURIComponent(personId)}`}>
            <Plus aria-hidden="true" />
            {t("requests.panel.new")}
          </Link>
        </Button>
      }
    >
      {requests.length === 0 ? (
        <p className="py-3 text-sm text-smoke">{t("requests.panel.empty")}</p>
      ) : (
        <RequestRows requests={requests} showRequester={showRequester} />
      )}
    </Panel>
  );
}
