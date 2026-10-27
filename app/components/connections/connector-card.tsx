/**
 * One need-search match: who they are, why they matched, how to reach them,
 * and View Profile, Contact or Request Introduction, and Save. Admins coming
 * from a CAP also get Add to this CAP (the CAP action checks that too).
 */
import { Link, useFetcher } from "react-router";
import { Check, CircleDashed, Loader2, MessageCircle, Plus } from "lucide-react";
import { PersonAvatar, Sheet, TagList } from "~/components/nva";
import { MatchReasons } from "~/components/resources/match-reasons";
import { ResourceActions } from "~/components/resources/resource-actions";
import { Button } from "~/components/ui/button";
import { useT, type MessageKey } from "~/i18n";
import type { ConnectorResult } from "~/lib/connections.server";
import { useTopicLabel } from "~/components/caps/cap-bits";
import { PathChain } from "./path-chain";

const VISIBLE_PATHS = 1;

export function ConnectorCard({
  result,
  cap,
  admin = false,
  saved = false,
}: {
  result: ConnectorResult;
  cap?: { id: string; title: string; partnerIds: string[] } | null;
  /** Admins get Add to this CAP (partners are managed by admins) and admin hints. */
  admin?: boolean;
  saved?: boolean;
}) {
  const { t } = useT();
  const topicLabel = useTopicLabel();
  const { person, direct, paths } = result;
  const matched = person.matched.map(topicLabel);
  const onCap = !!cap && cap.partnerIds.includes(person.id);
  const subtitle = [person.title, person.organization_name].filter(Boolean).join(", ");
  const shown = paths.slice(0, VISIBLE_PATHS);
  const more = paths.slice(VISIBLE_PATHS);

  return (
    <Sheet className="grid gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <PersonAvatar name={person.full_name} className="size-10" />
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 font-sans text-base font-bold tracking-normal">
            <Link
              to={`/app/people/${person.id}`}
              className="underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {person.full_name}
            </Link>
          </h3>
          {subtitle && <p className="text-sm text-smoke">{subtitle}</p>}
        </div>
        {direct && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1 text-xs font-medium text-gold-ink">
            <MessageCircle className="size-3.5" aria-hidden="true" />
            {t("connections.results.askDirectly")}
          </span>
        )}
        {cap && (onCap || admin) && (
          <div className="flex items-center gap-1">
            {cap &&
              (onCap ? (
                <span className="inline-flex items-center gap-1 text-xs text-sage-ink">
                  <Check className="size-3.5" aria-hidden="true" />
                  {t("connections.results.onCap")}
                </span>
              ) : (
                <AddToCap capId={cap.id} personId={person.id} name={person.full_name} />
              ))}
          </div>
        )}
      </div>

      {matched.length > 0 && !person.reasons.length && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-smoke">{t("connections.results.matched")}:</span>
          <TagList tags={matched} highlight={matched} max={3} />
        </div>
      )}
      <MatchReasons reasons={person.reasons} max={2} />
      <ResourceActions person={person} saved={saved} compact />

      {direct ? null : paths.length ? (
        <div className="grid gap-3 border-t border-stone pt-4">
          <p className="sr-only">{t("connections.results.pathsLabel", { name: person.full_name })}</p>
          {shown.map((path) => (
            <PathRow key={path.chain.map((p) => p.id).join(">")} path={path} />
          ))}
          {more.length > 0 && (
            <details className="group">
              <summary className="w-fit cursor-pointer rounded-full text-sm font-medium text-graphite underline decoration-gold decoration-2 underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                {t("connections.results.morePaths", { count: more.length })}
              </summary>
              <div className="mt-3 grid gap-3">
                {more.map((path) => (
                  <PathRow key={path.chain.map((p) => p.id).join(">")} path={path} />
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-2 border-t border-stone pt-4 text-sm text-smoke">
          <CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{t("connections.results.noPath")}</p>
        </div>
      )}
    </Sheet>
  );
}

function AddToCap({ capId, personId, name }: { capId: string; personId: string; name: string }) {
  const { t } = useT();
  const fetcher = useFetcher<{ ok: boolean; error?: MessageKey }>();
  const busy = fetcher.state !== "idle";
  const done = fetcher.state === "idle" && fetcher.data?.ok;
  const error = fetcher.state === "idle" && fetcher.data && !fetcher.data.ok ? fetcher.data.error : undefined;

  if (done) {
    return (
      <p role="status" className="inline-flex items-center gap-1.5 text-sm text-sage-ink">
        <Check className="size-4" aria-hidden="true" />
        {t("connections.results.addedToCap")}
      </p>
    );
  }
  return (
    <fetcher.Form method="post" action={`/app/caps/${capId}`} className="flex flex-col items-end gap-1">
      <input type="hidden" name="intent" value="add-partner" />
      <input type="hidden" name="personId" value={personId} />
      <Button type="submit" variant="outline" size="sm" disabled={busy} aria-label={`${t("caps.suggest.add")}: ${name}`}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {t("caps.suggest.add")}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-rust-ink">
          {t(error)}
        </p>
      )}
    </fetcher.Form>
  );
}

function PathRow({ path }: { path: ConnectorResult["paths"][number] }) {
  const { t } = useT();
  return (
    <div className="grid gap-1.5">
      <p className="text-eyebrow text-smoke">
        {path.degree === 1 ? t("connections.results.degree1") : t("connections.results.degree2")}
      </p>
      <PathChain path={path} />
    </div>
  );
}
